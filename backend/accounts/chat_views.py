"""Per-user chat session CRUD — list, get, save (upsert), delete."""

from __future__ import annotations

from django.db.models import Count
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import ChatMessage, ChatSession, WorkspaceUser


def _get_user(user_id: str) -> WorkspaceUser | None:
    if not user_id:
        return None
    return WorkspaceUser.objects.filter(id=user_id).first()


@api_view(["POST"])
def list_sessions(request):
    user = _get_user(request.data.get("userId"))
    if not user:
        return Response({"error": "Invalid userId"}, status=400)

    qs = (
        ChatSession.objects.filter(user=user)
        .annotate(message_count=Count("messages"))
        .values("id", "title", "created_at", "updated_at", "message_count")
    )
    sessions = [
        {
            "id": s["id"],
            "title": s["title"],
            "createdAt": int(s["created_at"].timestamp() * 1000),
            "updatedAt": int(s["updated_at"].timestamp() * 1000),
            "messageCount": s["message_count"],
        }
        for s in qs
    ]
    return Response({"sessions": sessions})


@api_view(["POST"])
def get_session(request):
    user = _get_user(request.data.get("userId"))
    if not user:
        return Response({"error": "Invalid userId"}, status=400)

    session_id = request.data.get("sessionId")
    session = ChatSession.objects.filter(id=session_id, user=user).first()
    if not session:
        return Response({"error": "Session not found"}, status=404)

    msgs = session.messages.all()
    messages = [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "timestamp": m.timestamp,
            "agent": m.agent or None,
            "files": m.files or [],
            "agentResult": m.agent_result,
            "process": m.process_state,
        }
        for m in msgs
    ]
    return Response({
        "session": {
            "id": session.id,
            "title": session.title,
            "createdAt": int(session.created_at.timestamp() * 1000),
            "updatedAt": int(session.updated_at.timestamp() * 1000),
            "messages": messages,
        }
    })


@api_view(["POST"])
def save_session(request):
    user = _get_user(request.data.get("userId"))
    if not user:
        return Response({"error": "Invalid userId"}, status=400)

    session_data = request.data.get("session")
    if not session_data or not session_data.get("id"):
        return Response({"error": "Missing session data"}, status=400)

    session, _ = ChatSession.objects.update_or_create(
        id=session_data["id"],
        defaults={
            "user": user,
            "title": session_data.get("title", "New Chat")[:255],
        },
    )

    incoming_messages = session_data.get("messages") or []
    incoming_ids = {m["id"] for m in incoming_messages if m.get("id")}
    session.messages.exclude(id__in=incoming_ids).delete()

    for idx, m in enumerate(incoming_messages):
        if not m.get("id"):
            continue
        ChatMessage.objects.update_or_create(
            id=m["id"],
            defaults={
                "session": session,
                "role": m.get("role", "user"),
                "content": m.get("content", ""),
                "timestamp": m.get("timestamp", 0),
                "agent": m.get("agent", ""),
                "files": m.get("files") or [],
                "agent_result": m.get("agentResult"),
                "process_state": m.get("process"),
                "ordering": idx,
            },
        )

    return Response({"sessionId": session.id, "messageCount": len(incoming_messages)})


@api_view(["POST"])
def delete_session(request):
    user = _get_user(request.data.get("userId"))
    if not user:
        return Response({"error": "Invalid userId"}, status=400)

    session_id = request.data.get("sessionId")
    deleted, _ = ChatSession.objects.filter(id=session_id, user=user).delete()
    return Response({"ok": deleted > 0})
