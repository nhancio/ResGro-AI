"""
DeepDive analyzer — processes DoorDash export dataset categories into structured insights.

Produces a dict-of-dicts result with:
  - executive_summary
  - financial (revenue, payouts, commissions, fees, daily trends)
  - sales (by order, by store, by time, product mix, customer segments)
  - marketing (promotions, sponsored listings, corporate vs Resgro, ROAS)
  - operations (avoidable wait, cancellations, missing/incorrect items)
  - support (refund analysis, reasons breakdown)
"""

from __future__ import annotations

from typing import Any

import pandas as pd
import numpy as np

from .metric_hierarchy import build_metric_hierarchy


def analyze(datasets: dict[str, pd.DataFrame], operator_id: str) -> dict[str, Any]:
    """Run all analysis modules and return consolidated results."""
    result: dict[str, Any] = {"operator_id": operator_id, "sections": {}}

    result["sections"]["financial"] = _analyze_financial(datasets)
    result["sections"]["sales"] = _analyze_sales(datasets)
    result["sections"]["product_mix"] = _analyze_product_mix(datasets)
    result["sections"]["marketing"] = _analyze_marketing(datasets)
    result["sections"]["operations"] = _analyze_operations(datasets)
    result["sections"]["ops_store"] = _analyze_ops_store(datasets)
    result["sections"]["ops_time"] = _analyze_ops_time(datasets)
    result["sections"]["support"] = _analyze_support(datasets)
    result["sections"]["executive_summary"] = _build_executive_summary(result["sections"])
    result["sections"]["metric_hierarchy"] = build_metric_hierarchy(datasets)

    return result


# ---------------------------------------------------------------------------
# Financial
# ---------------------------------------------------------------------------

def _analyze_financial(ds: dict[str, pd.DataFrame]) -> dict[str, Any]:
    result: dict[str, Any] = {}

    # Detailed transactions
    df = ds.get("financial_detailed")
    if df is not None and not df.empty:
        df = df.copy()
        if "Timestamp local date" in df.columns:
            df["date"] = pd.to_datetime(df["Timestamp local date"], errors="coerce")
        orders = df[df["Transaction type"] == "Order"].copy() if "Transaction type" in df.columns else df

        result["total_orders"] = len(orders)
        result["total_subtotal"] = _safe_sum(orders, "Subtotal")
        result["total_net_revenue"] = _safe_sum(orders, "Net total")
        result["total_commission"] = _safe_sum(orders, "Commission")
        result["total_marketing_fees"] = _safe_sum(orders, "Marketing fees | (including any applicable taxes)")
        result["total_customer_discounts_funded_by_you"] = _safe_sum(orders, "Customer discounts from marketing | (funded by you)")
        result["avg_order_value"] = round(result["total_subtotal"] / max(result["total_orders"], 1), 2)
        result["avg_net_per_order"] = round(result["total_net_revenue"] / max(result["total_orders"], 1), 2)
        result["payout_ratio"] = round(result["total_net_revenue"] / max(result["total_subtotal"], 0.01) * 100, 1)

        # Daily revenue trend
        if "date" in orders.columns:
            daily = orders.groupby("date").agg(
                orders_count=("Subtotal", "count"),
                subtotal=("Subtotal", "sum"),
                net_total=("Net total", "sum"),
            ).reset_index().sort_values("date")
            daily["date"] = daily["date"].dt.strftime("%Y-%m-%d")
            result["daily_trend"] = daily.to_dict("records")

        # By store
        if "Store name" in orders.columns:
            store_agg = orders.groupby("Store name").agg(
                orders=("Subtotal", "count"),
                subtotal=("Subtotal", "sum"),
                net_total=("Net total", "sum"),
                commission=("Commission", "sum"),
            ).reset_index().sort_values("subtotal", ascending=False)
            store_agg["aov"] = (store_agg["subtotal"] / store_agg["orders"].clip(lower=1)).round(2)
            result["by_store"] = store_agg.to_dict("records")

        # By channel
        if "Channel" in orders.columns:
            channel = orders.groupby("Channel").agg(
                orders=("Subtotal", "count"),
                subtotal=("Subtotal", "sum"),
            ).reset_index().sort_values("subtotal", ascending=False)
            result["by_channel"] = channel.to_dict("records")

        # Monthly breakdown
        if "date" in orders.columns:
            orders["month"] = orders["date"].dt.to_period("M").astype(str)
            monthly = orders.groupby("month").agg(
                orders=("Subtotal", "count"),
                subtotal=("Subtotal", "sum"),
                net_total=("Net total", "sum"),
            ).reset_index()
            result["monthly_breakdown"] = monthly.to_dict("records")

    # Error charges & adjustments
    df_err = ds.get("financial_errors")
    if df_err is not None and not df_err.empty:
        result["total_error_charges"] = _safe_sum(df_err, "Error charges")
        result["total_adjustments"] = _safe_sum(df_err, "Adjustments")
        result["error_adjustment_count"] = len(df_err)
        if "Store name" in df_err.columns:
            err_by_store = df_err.groupby("Store name").agg(
                count=("Error charges", "count"),
                error_charges=("Error charges", "sum"),
                adjustments=("Adjustments", "sum"),
            ).reset_index().sort_values("error_charges", ascending=True)
            result["errors_by_store"] = err_by_store.to_dict("records")

    # Payout summary
    df_pay = ds.get("financial_payouts")
    if df_pay is not None and not df_pay.empty:
        result["payout_summary"] = {
            "total_net_payout": _safe_sum(df_pay, "Net total"),
            "total_commission": _safe_sum(df_pay, "Commission"),
            "total_marketing_fees": _safe_sum(df_pay, "Marketing fees | (including any applicable taxes)"),
            "payout_count": len(df_pay),
        }

    return result


# ---------------------------------------------------------------------------
# Sales
# ---------------------------------------------------------------------------

def _bool_col_count(df: pd.DataFrame, col: str) -> int:
    """Count truthy values in a boolean-like string column (handles 'true'/'True'/'TRUE')."""
    if col not in df.columns:
        return 0
    return int(df[col].astype(str).str.strip().str.lower().eq("true").sum())


def _pick_col(df: pd.DataFrame, *candidates: str) -> str | None:
    """Return the first column name that exists in the DataFrame."""
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _analyze_sales(ds: dict[str, pd.DataFrame]) -> dict[str, Any]:
    result: dict[str, Any] = {}

    # ---- Sales by Order (DD_LAZ: SALES_BY_ORDER) ----
    df = ds.get("sales_by_order")
    if df is not None and not df.empty:
        df = df.copy()
        result["total_orders"] = len(df)

        result["cancelled_orders"] = _bool_col_count(df, "Is cancelled")
        result["dashpass_orders"] = _bool_col_count(df, "Is DashPass")
        result["group_orders"] = _bool_col_count(df, "Is group order")
        result["missing_or_incorrect_count"] = _bool_col_count(df, "Is missing or incorrect")

        ft_col = _pick_col(df, "Fulfillment type")
        if ft_col:
            result["pickup_orders"] = int(df[ft_col].astype(str).str.lower().str.contains("pickup").sum())
        else:
            result["pickup_orders"] = 0

        result["total_subtotal"] = _safe_sum(df, "Subtotal")
        result["total_error_charges"] = _safe_sum(df, "Error charge")
        result["avg_order_value"] = round(result["total_subtotal"] / max(len(df), 1), 2)
        result["cancellation_rate"] = round(result["cancelled_orders"] / max(len(df), 1) * 100, 2)
        result["dashpass_rate"] = round(result["dashpass_orders"] / max(len(df), 1) * 100, 2)
        result["error_rate"] = round(result["missing_or_incorrect_count"] / max(len(df), 1) * 100, 2)

        # Customer type breakdown
        ct_col = _pick_col(df, "Customer type")
        if ct_col:
            ct = df[ct_col].value_counts()
            result["customer_type_breakdown"] = ct.to_dict()
            result["new_customers"] = int(ct.get("new", 0))
            result["repeat_customers"] = int(ct.get("repeat", 0))

        # Rating distribution
        rating_col = _pick_col(df, "Customer rating", "Rating")
        if rating_col:
            ratings = pd.to_numeric(df[rating_col], errors="coerce").dropna()
            if len(ratings) > 0:
                result["avg_rating"] = round(ratings.mean(), 2)
                result["rating_distribution"] = {str(k): int(v) for k, v in ratings.value_counts().sort_index().items()}
                result["rated_orders_pct"] = round(len(ratings) / len(df) * 100, 1)

        # By store
        store_col = _pick_col(df, "Store name", "Store Name")
        if store_col:
            agg_dict: dict = {"orders": ("Subtotal", "count"), "subtotal": ("Subtotal", "sum")}
            if "Total item count" in df.columns:
                agg_dict["total_items"] = ("Total item count", "sum")
            store = df.groupby(store_col).agg(**agg_dict).reset_index().sort_values("subtotal", ascending=False)
            store["aov"] = (store["subtotal"] / store["orders"].clip(lower=1)).round(2)
            store = store.rename(columns={store_col: "Store name"})
            result["by_store"] = store.to_dict("records")

        # Daily order volume
        date_col = _pick_col(df, "Order placed date", "Order Placed Date")
        if date_col:
            df["date"] = pd.to_datetime(df[date_col], errors="coerce")
            daily = df.groupby("date").agg(
                orders=("Subtotal", "count"),
                subtotal=("Subtotal", "sum"),
            ).reset_index().sort_values("date")
            daily["date"] = daily["date"].dt.strftime("%Y-%m-%d")
            result["daily_orders"] = daily.to_dict("records")

        # Day of week pattern
        if "date" in df.columns:
            df["dow"] = df["date"].dt.day_name()
            dow = df.groupby("dow").agg(orders=("Subtotal", "count"), subtotal=("Subtotal", "sum")).reset_index()
            dow_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            dow["sort"] = dow["dow"].map({d: i for i, d in enumerate(dow_order)})
            dow = dow.sort_values("sort").drop(columns=["sort"])
            result["day_of_week"] = dow.to_dict("records")

        # Hourly pattern
        time_col = _pick_col(df, "Order placed time", "Order Placed Time")
        if time_col:
            hours = pd.to_datetime(df[time_col], format="%H:%M:%S", errors="coerce").dt.hour
            hourly = hours.dropna().astype(int).value_counts().sort_index()
            result["hourly_orders"] = {str(h): int(v) for h, v in hourly.items()}

    # ---- Sales by Store (DD_LAZ: SALES_BY_STORE) ----
    df_store = ds.get("sales_by_store")
    if df_store is not None and not df_store.empty:
        store_col = _pick_col(df_store, "Store name", "Store Name")
        if store_col:
            agg = df_store.groupby(store_col).agg(
                total_orders=("Total orders/deliveries (including cancelled)", "sum") if "Total orders/deliveries (including cancelled)" in df_store.columns else (df_store.columns[0], "count"),
                cancelled_orders=("Total cancelled orders/deliveries", "sum") if "Total cancelled orders/deliveries" in df_store.columns else (df_store.columns[0], "count"),
                gross_sales=("Gross sales", "sum") if "Gross sales" in df_store.columns else (df_store.columns[0], "count"),
            ).reset_index().sort_values("gross_sales", ascending=False)
            agg["aov"] = (agg["gross_sales"] / (agg["total_orders"] - agg["cancelled_orders"]).clip(lower=1)).round(2)
            agg = agg.rename(columns={store_col: "Store name"})
            result["store_performance"] = agg.to_dict("records")

        # DashPass breakdown by store
        dp_col = _pick_col(df_store, "Is DashPass")
        if dp_col and store_col:
            dp_true = df_store[df_store[dp_col].astype(str).str.lower() == "true"]
            if not dp_true.empty and "Gross sales" in dp_true.columns:
                dp_agg = dp_true.groupby(store_col).agg(
                    dashpass_orders=("Total orders/deliveries (including cancelled)", "sum") if "Total orders/deliveries (including cancelled)" in dp_true.columns else (dp_true.columns[0], "count"),
                    dashpass_sales=("Gross sales", "sum"),
                ).reset_index().rename(columns={store_col: "Store name"})
                result["dashpass_by_store"] = dp_agg.to_dict("records")

    # ---- Sales by Time (DD_LAZ: SALES_BY_TIME) ----
    df_time = ds.get("sales_by_time")
    if df_time is not None and not df_time.empty:
        df_time = df_time.copy()
        if "Start date" in df_time.columns:
            daily_agg = df_time.groupby("Start date").agg(
                total_orders=("Total orders/deliveries (including cancelled)", "sum") if "Total orders/deliveries (including cancelled)" in df_time.columns else (df_time.columns[0], "count"),
                gross_sales=("Gross sales", "sum") if "Gross sales" in df_time.columns else (df_time.columns[0], "count"),
            ).reset_index().sort_values("Start date")
            result["time_series_sales"] = daily_agg.to_dict("records")

    # ---- Legacy: sales_store_product / sales_store_customers ----
    df_sp = ds.get("sales_store_product")
    if df_sp is not None and not df_sp.empty and "store_performance" not in result:
        cols = ["Store Name", "Merchant Supplied ID", "Gross Sales", "Total Orders Including Cancelled Orders",
                "Total Delivered or Picked Up Orders", "AOV"]
        available = [c for c in cols if c in df_sp.columns]
        result["store_performance"] = df_sp[available].to_dict("records")

    df_cust = ds.get("sales_store_customers")
    if df_cust is not None and not df_cust.empty:
        cols = ["Store Name", "Gross Sales", "Total Delivered or Picked Up Orders",
                "New Customer Count", "Existing Customer Count",
                "Dashpass Customer Count", "Non-Dashpass Customer Count"]
        available = [c for c in cols if c in df_cust.columns]
        result["store_customers"] = df_cust[available].to_dict("records")

    df_tc = ds.get("sales_time_customers")
    if df_tc is not None and not df_tc.empty:
        cols = ["Start Date", "Gross Sales", "New Customer Count", "Existing Customer Count"]
        available = [c for c in cols if c in df_tc.columns]
        result["time_series_customers"] = df_tc[available].to_dict("records")

    return result


# ---------------------------------------------------------------------------
# Marketing
# ---------------------------------------------------------------------------

def _analyze_marketing(ds: dict[str, pd.DataFrame]) -> dict[str, Any]:
    result: dict[str, Any] = {}

    # Promotions
    df = ds.get("marketing_promotions")
    if df is not None and not df.empty:
        df = df.copy()
        result["promo_total_orders"] = _safe_sum(df, "Orders")
        result["promo_total_sales"] = _safe_sum(df, "Sales")
        spend_col = "Customer discounts from marketing | (Funded by you)"
        result["promo_total_spend"] = abs(_safe_sum(df, spend_col))
        result["promo_new_customers"] = _safe_sum(df, "New customers acquired")
        result["promo_existing_customers"] = _safe_sum(df, "Existing customers acquired")
        result["promo_roas"] = round(result["promo_total_sales"] / max(result["promo_total_spend"], 0.01), 2)
        result["promo_cost_per_order"] = round(result["promo_total_spend"] / max(result["promo_total_orders"], 1), 2)
        result["promo_cost_per_new_customer"] = round(result["promo_total_spend"] / max(result["promo_new_customers"], 1), 2)

        # Corporate vs Resgro
        if "Is self serve campaign" in df.columns:
            df["segment"] = df["Is self serve campaign"].astype(str).str.lower().map(
                {"false": "Corporate", "true": "Resgro"}
            ).fillna("Unknown")
            seg = df.groupby("segment").agg(
                orders=("Orders", "sum"),
                sales=("Sales", "sum"),
                spend=(spend_col, lambda x: abs(x.sum())),
                new_customers=("New customers acquired", "sum"),
            ).reset_index()
            seg["roas"] = (seg["sales"] / seg["spend"].clip(lower=0.01)).round(2)
            seg["cost_per_order"] = (seg["spend"] / seg["orders"].clip(lower=1)).round(2)
            result["corporate_vs_todc_promos"] = seg.to_dict("records")

        # By campaign
        if "Campaign name" in df.columns:
            camp = df.groupby("Campaign name").agg(
                orders=("Orders", "sum"),
                sales=("Sales", "sum"),
                spend=(spend_col, lambda x: abs(x.sum())),
                new_customers=("New customers acquired", "sum"),
            ).reset_index().sort_values("sales", ascending=False)
            camp["roas"] = (camp["sales"] / camp["spend"].clip(lower=0.01)).round(2)
            result["top_promo_campaigns"] = camp.head(15).to_dict("records")

        # Monthly promo trend
        if "Date" in df.columns:
            df["date"] = pd.to_datetime(df["Date"], errors="coerce")
            df["month"] = df["date"].dt.to_period("M").astype(str)
            monthly = df.groupby("month").agg(
                orders=("Orders", "sum"),
                sales=("Sales", "sum"),
                spend=(spend_col, lambda x: abs(x.sum())),
                new_customers=("New customers acquired", "sum"),
            ).reset_index()
            monthly["roas"] = (monthly["sales"] / monthly["spend"].clip(lower=0.01)).round(2)
            result["promo_monthly_trend"] = monthly.to_dict("records")

    # Sponsored Listings
    df_sp = ds.get("marketing_sponsored")
    if df_sp is not None and not df_sp.empty:
        df_sp = df_sp.copy()
        spend_col_sp = "Marketing fees | (including any applicable taxes)"
        result["sponsored_total_orders"] = _safe_sum(df_sp, "Orders")
        result["sponsored_total_sales"] = _safe_sum(df_sp, "Sales")
        result["sponsored_total_spend"] = abs(_safe_sum(df_sp, spend_col_sp))
        result["sponsored_impressions"] = _safe_sum(df_sp, "Impressions")
        result["sponsored_clicks"] = _safe_sum(df_sp, "Clicks")
        result["sponsored_roas"] = round(result["sponsored_total_sales"] / max(result["sponsored_total_spend"], 0.01), 2)
        result["sponsored_ctr"] = round(result["sponsored_clicks"] / max(result["sponsored_impressions"], 1) * 100, 2)
        result["sponsored_conversion_rate"] = round(result["sponsored_total_orders"] / max(result["sponsored_clicks"], 1) * 100, 2)

        # Corporate vs Resgro for sponsored
        if "Is self serve campaign" in df_sp.columns:
            df_sp["segment"] = df_sp["Is self serve campaign"].astype(str).str.lower().map(
                {"false": "Corporate", "true": "Resgro"}
            ).fillna("Unknown")
            seg_sp = df_sp.groupby("segment").agg(
                orders=("Orders", "sum"),
                sales=("Sales", "sum"),
                spend=(spend_col_sp, lambda x: abs(x.sum())),
                impressions=("Impressions", "sum"),
                clicks=("Clicks", "sum"),
            ).reset_index()
            seg_sp["roas"] = (seg_sp["sales"] / seg_sp["spend"].clip(lower=0.01)).round(2)
            seg_sp["ctr"] = (seg_sp["clicks"] / seg_sp["impressions"].clip(lower=1) * 100).round(2)
            result["corporate_vs_todc_sponsored"] = seg_sp.to_dict("records")

    # Combined marketing totals
    result["combined_marketing_spend"] = result.get("promo_total_spend", 0) + result.get("sponsored_total_spend", 0)
    result["combined_marketing_sales"] = result.get("promo_total_sales", 0) + result.get("sponsored_total_sales", 0)
    result["combined_marketing_roas"] = round(
        result["combined_marketing_sales"] / max(result["combined_marketing_spend"], 0.01), 2
    )

    return result


# ---------------------------------------------------------------------------
# Operations / Quality
# ---------------------------------------------------------------------------

def _analyze_operations(ds: dict[str, pd.DataFrame]) -> dict[str, Any]:
    result: dict[str, Any] = {}

    # Avoidable wait
    df_wait = ds.get("ops_avoidable_wait")
    if df_wait is not None and not df_wait.empty:
        result["total_orders_with_wait_data"] = len(df_wait)
        result["avg_avoidable_wait_min"] = round(pd.to_numeric(df_wait.get("Avoidable Wait Time", pd.Series(dtype=float)), errors="coerce").mean(), 2)
        result["avg_delivery_time_min"] = round(pd.to_numeric(df_wait.get("Total Delivery Time (ASAP Time)", pd.Series(dtype=float)), errors="coerce").mean(), 2)

        # By store
        if "Store Name" in df_wait.columns:
            wait_num = pd.to_numeric(df_wait["Avoidable Wait Time"], errors="coerce")
            delivery_num = pd.to_numeric(df_wait["Total Delivery Time (ASAP Time)"], errors="coerce")
            store_wait = df_wait.assign(
                wait=wait_num,
                delivery=delivery_num,
            ).groupby("Store Name").agg(
                orders=("wait", "count"),
                avg_wait=("wait", "mean"),
                avg_delivery=("delivery", "mean"),
                p90_wait=("wait", lambda x: x.quantile(0.9)),
            ).reset_index().round(2).sort_values("avg_wait", ascending=False)
            result["wait_by_store"] = store_wait.to_dict("records")

        # Wait time distribution (buckets)
        wait_vals = pd.to_numeric(df_wait.get("Avoidable Wait Time", pd.Series(dtype=float)), errors="coerce").dropna()
        if len(wait_vals) > 0:
            bins = [0, 2, 5, 10, 15, 20, float("inf")]
            labels = ["0-2min", "2-5min", "5-10min", "10-15min", "15-20min", "20+min"]
            dist = pd.cut(wait_vals, bins=bins, labels=labels).value_counts().sort_index()
            result["wait_distribution"] = dist.to_dict()

    # Cancellations
    df_cancel = ds.get("ops_cancelled")
    if df_cancel is not None and not df_cancel.empty:
        result["total_cancellations"] = len(df_cancel)

        if "Cancellation Category - Short" in df_cancel.columns:
            cat = df_cancel["Cancellation Category - Short"].value_counts()
            result["cancellation_reasons"] = cat.to_dict()

        if "Paid" in df_cancel.columns:
            paid = df_cancel["Paid"].astype(str).str.lower().eq("true").sum()
            result["cancellations_paid"] = int(paid)
            result["cancellations_unpaid"] = len(df_cancel) - int(paid)

        if "Store Name" in df_cancel.columns:
            by_store = df_cancel.groupby("Store Name").size().reset_index(name="cancellations").sort_values("cancellations", ascending=False)
            result["cancellations_by_store"] = by_store.to_dict("records")

    # Missing / Incorrect
    df_mi = ds.get("ops_missing_incorrect")
    if df_mi is not None and not df_mi.empty:
        result["total_error_items"] = len(df_mi)
        result["total_error_charges"] = _safe_sum(df_mi, "Error Charge")

        if "Error Category" in df_mi.columns:
            cats = df_mi["Error Category"].value_counts()
            result["error_categories"] = cats.to_dict()

        if "Menu Category" in df_mi.columns:
            menu = df_mi.groupby("Menu Category").agg(
                count=("Error Charge", "count"),
                total_charge=("Error Charge", "sum"),
            ).reset_index().sort_values("count", ascending=False)
            result["errors_by_menu_category"] = menu.head(15).to_dict("records")

        if "Item Name" in df_mi.columns:
            items = df_mi.groupby("Item Name").agg(
                count=("Error Charge", "count"),
                total_charge=("Error Charge", "sum"),
            ).reset_index().sort_values("count", ascending=False)
            result["top_error_items"] = items.head(15).to_dict("records")

        if "Store Name" in df_mi.columns:
            store_err = df_mi.groupby("Store Name").agg(
                error_count=("Error Charge", "count"),
                total_charge=("Error Charge", "sum"),
            ).reset_index().sort_values("error_count", ascending=False)
            result["errors_by_store"] = store_err.to_dict("records")

    return result


# ---------------------------------------------------------------------------
# Product Mix
# ---------------------------------------------------------------------------

def _analyze_product_mix(ds: dict[str, pd.DataFrame]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    df = ds.get("product_mix")
    if df is None or df.empty:
        return result

    df = df.copy()
    result["total_items_listed"] = len(df)
    result["total_gross_sales"] = _safe_sum(df, "Gross sales")
    result["total_discounts"] = _safe_sum(df, "Discounts")
    result["total_sold"] = _safe_sum(df, "Total sold")
    result["total_item_errors"] = _safe_sum(df, "Total item errors")
    result["total_error_charges"] = _safe_sum(df, "Total error charges")

    item_col = _pick_col(df, "Item name", "Item Name")
    if item_col:
        item_agg = df.groupby(item_col).agg(
            gross_sales=("Gross sales", "sum") if "Gross sales" in df.columns else (df.columns[0], "count"),
            total_sold=("Total sold", "sum") if "Total sold" in df.columns else (df.columns[0], "count"),
            discounts=("Discounts", "sum") if "Discounts" in df.columns else (df.columns[0], "count"),
            total_errors=("Total item errors", "sum") if "Total item errors" in df.columns else (df.columns[0], "count"),
            error_charges=("Total error charges", "sum") if "Total error charges" in df.columns else (df.columns[0], "count"),
        ).reset_index().rename(columns={item_col: "item_name"})

        # Top sellers
        top_sellers = item_agg.sort_values("gross_sales", ascending=False).head(20)
        top_sellers["error_rate_pct"] = (top_sellers["total_errors"] / top_sellers["total_sold"].clip(lower=1) * 100).round(2)
        result["top_sellers"] = top_sellers.to_dict("records")

        # Most error-prone items
        error_items = item_agg[item_agg["total_errors"] > 0].sort_values("total_errors", ascending=False).head(15)
        error_items["error_rate_pct"] = (error_items["total_errors"] / error_items["total_sold"].clip(lower=1) * 100).round(2)
        result["top_error_items"] = error_items.to_dict("records")

    # By store
    store_col = _pick_col(df, "Store name", "Store Name")
    if store_col:
        store_mix = df.groupby(store_col).agg(
            items=("Gross sales", "count") if "Gross sales" in df.columns else (df.columns[0], "count"),
            gross_sales=("Gross sales", "sum") if "Gross sales" in df.columns else (df.columns[0], "count"),
            total_sold=("Total sold", "sum") if "Total sold" in df.columns else (df.columns[0], "count"),
            total_errors=("Total item errors", "sum") if "Total item errors" in df.columns else (df.columns[0], "count"),
        ).reset_index().rename(columns={store_col: "Store name"}).sort_values("gross_sales", ascending=False)
        store_mix["error_rate_pct"] = (store_mix["total_errors"] / store_mix["total_sold"].clip(lower=1) * 100).round(2)
        result["by_store"] = store_mix.to_dict("records")

    # Popular items
    pop_col = _pick_col(df, "Popular item")
    if pop_col and item_col:
        popular = df[df[pop_col].astype(str).str.strip() == "1"]
        if not popular.empty:
            pop_agg = popular.groupby(item_col).agg(
                gross_sales=("Gross sales", "sum") if "Gross sales" in df.columns else (df.columns[0], "count"),
                total_sold=("Total sold", "sum") if "Total sold" in df.columns else (df.columns[0], "count"),
            ).reset_index().rename(columns={item_col: "item_name"}).sort_values("gross_sales", ascending=False)
            result["popular_items"] = pop_agg.head(15).to_dict("records")

    return result


# ---------------------------------------------------------------------------
# Operations Quality — Store-level aggregates
# ---------------------------------------------------------------------------

def _analyze_ops_store(ds: dict[str, pd.DataFrame]) -> dict[str, Any]:
    result: dict[str, Any] = {}

    # Store scorecard (aggregate)
    df = ds.get("ops_store_aggregate")
    if df is not None and not df.empty:
        scorecard_cols = [
            "Store Name", "Store ID", "Merchant Supplied ID",
            "Total Orders Including Cancelled Orders", "Total Delivered or Picked Up Orders",
            "Total Missing or Incorrect Orders", "Missing/Incorrect %",
            "Total Cancelled Orders", "Total Cancellation Rate %",
            "Total Avoidable Cancellations", "Avoidable Cancellation Rate %",
            "Average Avoidable Dasher Wait", "Average Dasher Wait",
            "Average Delivery Time (ASAP)", "Uptime %", "Downtime %",
            "Total Downtime in Minutes", "Average Rating",
            "Total Number of Ratings Received in Period of Time",
            "Total 5 Star Ratings", "Total 1 Star Ratings",
            "Number of Loved", "Percentage of Loved",
        ]
        available = [c for c in scorecard_cols if c in df.columns]
        result["store_scorecard"] = df[available].to_dict("records")

        # Averages across stores
        for metric in ["Missing/Incorrect %", "Total Cancellation Rate %", "Average Avoidable Dasher Wait",
                       "Average Delivery Time (ASAP)", "Uptime %", "Average Rating"]:
            if metric in df.columns:
                vals = pd.to_numeric(df[metric], errors="coerce").dropna()
                if len(vals) > 0:
                    key = metric.lower().replace(" ", "_").replace("/", "_").replace("%", "pct").replace("(", "").replace(")", "")
                    result[f"avg_{key}"] = round(vals.mean(), 2)

    # Cancellation breakdown by store
    df_cancel = ds.get("ops_store_cancellations")
    if df_cancel is not None and not df_cancel.empty:
        if "Cancellation Category - Short" in df_cancel.columns and "Count of Orders" in df_cancel.columns:
            cat_agg = df_cancel.groupby("Cancellation Category - Short")["Count of Orders"].sum().sort_values(ascending=False)
            result["cancellation_categories"] = cat_agg.to_dict()

        store_col = _pick_col(df_cancel, "Store Name", "Store name")
        if store_col and "Count of Orders" in df_cancel.columns:
            by_store = df_cancel.groupby([store_col, "Cancellation Category - Short"])["Count of Orders"].sum().reset_index()
            by_store = by_store.rename(columns={store_col: "Store name", "Cancellation Category - Short": "category", "Count of Orders": "count"})
            result["cancellations_by_store_category"] = by_store.to_dict("records")

    # Downtime
    df_down = ds.get("ops_store_downtime")
    if df_down is not None and not df_down.empty:
        if "Downtime Category - Short" in df_down.columns and "Minutes Downtime" in df_down.columns:
            cat_down = df_down.groupby("Downtime Category - Short")["Minutes Downtime"].sum().sort_values(ascending=False)
            result["downtime_categories"] = {k: int(v) for k, v in cat_down.items()}
            result["total_downtime_minutes"] = int(cat_down.sum())

        store_col = _pick_col(df_down, "Store Name", "Store name")
        if store_col and "Minutes Downtime" in df_down.columns:
            by_store = df_down.groupby(store_col)["Minutes Downtime"].sum().reset_index().sort_values("Minutes Downtime", ascending=False)
            by_store = by_store.rename(columns={store_col: "Store name", "Minutes Downtime": "downtime_minutes"})
            result["downtime_by_store"] = by_store.to_dict("records")

    # Missing/Incorrect by store
    df_mi = ds.get("ops_store_missing_incorrect")
    if df_mi is not None and not df_mi.empty:
        if "Error Category" in df_mi.columns and "Count of Item Errors" in df_mi.columns:
            err_cats = df_mi.groupby("Error Category")["Count of Item Errors"].sum().sort_values(ascending=False)
            result["error_type_breakdown"] = err_cats.to_dict()

    return result


# ---------------------------------------------------------------------------
# Operations Quality — Time-series
# ---------------------------------------------------------------------------

def _analyze_ops_time(ds: dict[str, pd.DataFrame]) -> dict[str, Any]:
    result: dict[str, Any] = {}

    # Daily aggregate quality metrics
    df = ds.get("ops_time_aggregate")
    if df is not None and not df.empty:
        df = df.copy()
        date_col = _pick_col(df, "Start Date", "Start date")
        if date_col:
            key_metrics = [
                "Total Orders Including Cancelled Orders", "Total Delivered or Picked Up Orders",
                "Missing/Incorrect %", "Total Cancellation Rate %",
                "Average Avoidable Dasher Wait", "Average Delivery Time (ASAP)",
            ]
            available = [c for c in key_metrics if c in df.columns]
            trend = df[[date_col] + available].copy().sort_values(date_col)
            trend = trend.rename(columns={date_col: "date"})
            result["daily_quality_trend"] = trend.to_dict("records")

    # By-store time-series
    df_bs = ds.get("ops_time_by_store")
    if df_bs is not None and not df_bs.empty:
        store_col = _pick_col(df_bs, "Store Name", "Store name")
        if store_col and "Missing/Incorrect %" in df_bs.columns:
            store_quality = df_bs.groupby(store_col).agg(
                avg_error_pct=("Missing/Incorrect %", "mean"),
                avg_cancel_pct=("Total Cancellation Rate %", "mean") if "Total Cancellation Rate %" in df_bs.columns else ("Missing/Incorrect %", "count"),
                avg_wait=("Average Avoidable Dasher Wait", "mean") if "Average Avoidable Dasher Wait" in df_bs.columns else ("Missing/Incorrect %", "count"),
            ).reset_index().rename(columns={store_col: "Store name"}).round(2).sort_values("avg_error_pct", ascending=False)
            result["store_quality_averages"] = store_quality.to_dict("records")

    # Product mix quality
    df_pm = ds.get("ops_time_product_mix")
    if df_pm is not None and not df_pm.empty:
        item_col = _pick_col(df_pm, "Item Name", "Item name")
        if item_col:
            cols_wanted = ["Gross Item Sales", "Item Volume", "Total Item Missing or Incorrect Errors",
                           "Item Missing/Incorrect %", "Total Item Error Charges"]
            available = [c for c in cols_wanted if c in df_pm.columns]
            if available:
                item_quality = df_pm.groupby(item_col).agg(
                    **{c: (c, "sum") if "Total" in c or "Volume" in c or "Sales" in c or "Charges" in c else (c, "mean") for c in available}
                ).reset_index().rename(columns={item_col: "item_name"}).sort_values(
                    "Total Item Missing or Incorrect Errors" if "Total Item Missing or Incorrect Errors" in available else available[0],
                    ascending=False,
                ).head(20)
                result["item_quality_ranking"] = item_quality.round(2).to_dict("records")

    return result


# ---------------------------------------------------------------------------
# Support
# ---------------------------------------------------------------------------

def _analyze_support(ds: dict[str, pd.DataFrame]) -> dict[str, Any]:
    result: dict[str, Any] = {}

    df = ds.get("support")
    if df is None or df.empty:
        return result

    result["total_support_cases"] = len(df)

    if "Primary reason" in df.columns:
        primary = df["Primary reason"].value_counts()
        result["primary_reasons"] = primary.to_dict()

    if "Secondary reason" in df.columns:
        secondary = df["Secondary reason"].value_counts()
        result["secondary_reasons"] = secondary.head(10).to_dict()

    if "Party responsible for refund" in df.columns:
        party = df["Party responsible for refund"].value_counts()
        result["responsible_party"] = party.to_dict()

    if "Original order value" in df.columns:
        result["total_original_order_value"] = _safe_sum(df, "Original order value")
    if "$ Order value to refund to customer" in df.columns:
        result["total_refund_to_customer"] = _safe_sum(df, "$ Order value to refund to customer")
    if "Total refund to store" in df.columns:
        result["total_refund_to_store"] = _safe_sum(df, "Total refund to store")

    if "Full order refund to customer?" in df.columns:
        full_refunds = df["Full order refund to customer?"].astype(str).str.lower().eq("yes").sum()
        result["full_refund_pct"] = round(full_refunds / max(len(df), 1) * 100, 1)

    if "Store name" in df.columns:
        store = df.groupby("Store name").size().reset_index(name="cases").sort_values("cases", ascending=False)
        result["support_by_store"] = store.to_dict("records")

    # Monthly trend
    if "Refund creation date" in df.columns:
        df = df.copy()
        df["date"] = pd.to_datetime(df["Refund creation date"], errors="coerce")
        df["month"] = df["date"].dt.to_period("M").astype(str)
        monthly = df.groupby("month").size().reset_index(name="cases")
        result["monthly_support_trend"] = monthly.to_dict("records")

    return result


# ---------------------------------------------------------------------------
# Executive Summary
# ---------------------------------------------------------------------------


def _headline_from_sales_aggregates(sales: dict[str, Any]) -> tuple[float, int, float]:
    """
    When FINANCIAL_DETAILED is missing, approximate revenue/orders from SALES* exports
    (store- or time-level), so KPIs are not all zero while marketing still works.
    """
    if sales.get("total_subtotal") is not None and (sales.get("total_orders") or 0) > 0:
        tr = float(sales.get("total_subtotal") or 0)
        to = int(sales.get("total_orders") or 0)
        aov = float(sales.get("avg_order_value") or 0) or (round(tr / max(to, 1), 2) if to else 0.0)
        return tr, to, aov
    rows = sales.get("store_performance") or []
    if not rows:
        return 0.0, 0, 0.0
    g = 0.0
    o = 0.0
    for x in rows:
        g += float(x.get("Gross Sales") or 0)
        o += float(
            x.get("Total Delivered or Picked Up Orders")
            or x.get("Total Orders Including Cancelled Orders")
            or 0
        )
    o_i = int(round(o))
    aov = round(g / max(o, 1), 2) if o else 0.0
    return g, o_i, aov


def _build_executive_summary(sections: dict[str, Any]) -> dict[str, Any]:
    fin = sections.get("financial", {})
    sales = sections.get("sales", {})
    mkt = sections.get("marketing", {})
    ops = sections.get("operations", {})
    ops_store = sections.get("ops_store", {})
    product_mix = sections.get("product_mix", {})
    sup = sections.get("support", {})

    summary: dict[str, Any] = {}

    # Key headline numbers — require FINANCIAL_DETAILED for true net payout; fall back to SALES aggregates
    tr = float(fin.get("total_subtotal") or 0)
    tnp = float(fin.get("total_net_revenue") or 0)
    to = int(fin.get("total_orders") or 0)
    aov = float(fin.get("avg_order_value") or 0)
    pr = float(fin.get("payout_ratio", 0) or 0)
    if tr == 0 and tnp == 0 and to == 0:
        fr, fo, faov = _headline_from_sales_aggregates(sales)
        if fr > 0 or fo > 0:
            aov = faov if faov > 0 else (round(fr / max(fo, 1), 2) if fo else 0.0)
            tr, to = fr, fo
            tnp = 0.0
            pr = 0.0
            summary["data_warning"] = (
                "Revenue and order counts are estimated from **SALES_** export totals. "
                "For accurate net payout, commission, and Performance hierarchy, include the **Financial** export zip "
                "(contains `FINANCIAL_DETAILED_TRANSACTIONS_*.csv`)."
            )

    summary["total_revenue"] = tr
    summary["total_net_payout"] = tnp
    summary["total_orders"] = to
    summary["avg_order_value"] = aov
    summary["payout_ratio_pct"] = pr

    summary["dashpass_rate_pct"] = sales.get("dashpass_rate", 0)
    summary["cancellation_rate_pct"] = sales.get("cancellation_rate", 0)
    summary["error_rate_pct"] = sales.get("error_rate", 0)
    summary["new_customers"] = sales.get("new_customers", 0)
    summary["repeat_customers"] = sales.get("repeat_customers", 0)

    summary["total_marketing_spend"] = mkt.get("combined_marketing_spend", 0)
    summary["marketing_roas"] = mkt.get("combined_marketing_roas", 0)
    summary["new_customers_acquired"] = mkt.get("promo_new_customers", 0)

    summary["total_cancellations"] = ops.get("total_cancellations", 0)
    summary["avg_avoidable_wait_min"] = ops.get("avg_avoidable_wait_min", 0)
    summary["total_support_cases"] = sup.get("total_support_cases", 0)

    # Product mix headline
    summary["total_menu_items"] = product_mix.get("total_items_listed", 0)
    summary["product_mix_sales"] = product_mix.get("total_gross_sales", 0)

    # Store scorecard averages from ops_store
    summary["avg_uptime_pct"] = ops_store.get("avg_uptime_pct", 0)
    summary["total_downtime_minutes"] = ops_store.get("total_downtime_minutes", 0)

    # Insights
    insights = []
    if summary["payout_ratio_pct"] > 0:
        insights.append(f"Net payout ratio is {summary['payout_ratio_pct']}% — every $1 in sales yields ${summary['payout_ratio_pct']/100:.2f} net.")
    if summary["dashpass_rate_pct"] > 50:
        insights.append(f"DashPass orders dominate at {summary['dashpass_rate_pct']}% — loyalty base is strong.")
    elif summary["dashpass_rate_pct"] > 0:
        insights.append(f"DashPass penetration is {summary['dashpass_rate_pct']}% — room to grow subscription orders.")
    if summary["cancellation_rate_pct"] > 3:
        insights.append(f"Cancellation rate of {summary['cancellation_rate_pct']}% is elevated — investigate root causes.")
    if summary["marketing_roas"] > 0:
        insights.append(f"Combined marketing ROAS is {summary['marketing_roas']}x — ${summary['total_marketing_spend']:,.0f} spend drove ${mkt.get('combined_marketing_sales', 0):,.0f} in sales.")
    if summary["avg_avoidable_wait_min"] and summary["avg_avoidable_wait_min"] > 5:
        insights.append(f"Average avoidable wait is {summary['avg_avoidable_wait_min']} min — consider prep workflow improvements.")
    if summary["total_support_cases"] > 0:
        insights.append(f"{summary['total_support_cases']} support/refund cases in period.")
    if summary["avg_uptime_pct"] and summary["avg_uptime_pct"] < 98:
        insights.append(f"Average store uptime is {summary['avg_uptime_pct']}% — downtime is costing orders.")
    if summary["new_customers"] and summary["total_orders"]:
        new_pct = round(summary["new_customers"] / summary["total_orders"] * 100, 1)
        insights.append(f"New customers make up {new_pct}% of orders ({summary['new_customers']:,} new vs {summary['repeat_customers']:,} repeat).")

    summary["insights"] = insights
    return summary


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_sum(df: pd.DataFrame, col: str) -> float:
    if col not in df.columns:
        return 0.0
    return float(pd.to_numeric(df[col], errors="coerce").sum())


# ---------------------------------------------------------------------------
# Slot AOV & Profitability tables  (Day+Daypart × Store)
# ---------------------------------------------------------------------------

_DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_DAYPART_ORDER = ["Early Morning", "Breakfast", "Lunch", "Afternoon", "Dinner", "Late Night"]


def _hour_to_daypart(h: int) -> str:
    if 0 <= h <= 4:
        return "Early Morning"
    if 5 <= h <= 10:
        return "Breakfast"
    if 11 <= h <= 13:
        return "Lunch"
    if 14 <= h <= 16:
        return "Afternoon"
    if 17 <= h <= 19:
        return "Dinner"
    return "Late Night"


# Slot numbering matches DoorDash custom-schedule grid (6 dayparts × 7 days = 42).
# Row-major: for each daypart row, Mon→Sun, then next daypart.
SLOT_NUMBER_MAP: dict[str, int] = {}
for _dp_i, _dp in enumerate(_DAYPART_ORDER):
    for _d_i, _d in enumerate(_DAY_ORDER):
        SLOT_NUMBER_MAP[f"{_d}-{_dp}"] = _dp_i * 7 + _d_i + 1


def _slot_sort_key(slot: str) -> tuple[int, int]:
    parts = slot.split("-", 1)
    day_idx = _DAY_ORDER.index(parts[0]) if parts[0] in _DAY_ORDER else 99
    dp_idx = _DAYPART_ORDER.index(parts[1]) if len(parts) > 1 and parts[1] in _DAYPART_ORDER else 99
    return (day_idx, dp_idx)


def build_slot_tables(datasets: dict[str, pd.DataFrame]) -> dict[str, Any]:
    """Build AOV and profitability pivot tables: Day+Daypart (rows) × Store (columns)."""
    df = datasets.get("financial_detailed")
    if df is None or df.empty:
        return {}

    df = df.copy()
    if "Transaction type" in df.columns:
        df = df[df["Transaction type"] == "Order"]
    if df.empty:
        return {}

    ts_col = "Timestamp local time" if "Timestamp local time" in df.columns else None
    if ts_col is None:
        return {}

    df["_ts"] = pd.to_datetime(df[ts_col], errors="coerce")
    df = df.dropna(subset=["_ts"])

    df["_day"] = df["_ts"].dt.day_name().str[:3]
    df["_hour"] = df["_ts"].dt.hour
    df["_daypart"] = df["_hour"].apply(_hour_to_daypart)
    df["_slot"] = df["_day"] + "-" + df["_daypart"]

    store_col = "Merchant store ID" if "Merchant store ID" in df.columns else "Store ID"
    df[store_col] = df[store_col].astype(str)

    for c in ("Subtotal", "Net total"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    df = df.dropna(subset=["Subtotal"])
    df = df[df["Subtotal"] > 0]

    aov_pivot = df.pivot_table(
        index="_slot", columns=store_col, values="Subtotal", aggfunc="mean",
    ).round(2)

    profit_num = df.pivot_table(
        index="_slot", columns=store_col, values="Net total", aggfunc="sum",
    )
    profit_den = df.pivot_table(
        index="_slot", columns=store_col, values="Subtotal", aggfunc="sum",
    )
    profitability_pivot = ((profit_num / profit_den.replace(0, np.nan)) * 100).round(1)

    all_slots = sorted(aov_pivot.index.tolist(), key=_slot_sort_key)
    stores = [str(s) for s in aov_pivot.columns.tolist()]

    aov_records = []
    for slot in all_slots:
        row = {"slot": slot}
        for s in stores:
            val = aov_pivot.at[slot, s] if s in aov_pivot.columns and slot in aov_pivot.index else None
            row[s] = float(val) if pd.notna(val) else None
        aov_records.append(row)

    prof_records = []
    for slot in all_slots:
        row = {"slot": slot}
        for s in stores:
            val = profitability_pivot.at[slot, s] if s in profitability_pivot.columns and slot in profitability_pivot.index else None
            row[s] = float(val) if pd.notna(val) else None
        prof_records.append(row)

    return {
        "slots": all_slots,
        "stores": stores,
        "aov_table": aov_records,
        "profitability_table": prof_records,
        "slot_number_map": {s: SLOT_NUMBER_MAP.get(s, 0) for s in all_slots},
    }


# Legacy compatibility
def analyze_rows(rows: list[dict], operator_id: str):
    """Legacy stub — kept for backwards compat with old import."""
    from shared.models.report import DeepDiveReport, OrderBreakdown, RevenueMetrics
    from shared.utils.date_helpers import utc_now_iso
    return DeepDiveReport(
        operator_id=operator_id,
        analysis_date=utc_now_iso(),
        order_breakdown=OrderBreakdown(),
        revenue_metrics=RevenueMetrics(),
            recommendations_seed="Use analyze() with FINANCIAL_DETAILED and related export datasets for full analysis.",
    )
