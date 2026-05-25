# EmailJS Template – Contact Form

The website sends these **exact variables** to EmailJS. Your template must use the same names (case-sensitive).

## Variables sent from the form

| Variable       | Description        | Example        |
|----------------|--------------------|----------------|
| `{{from_name}}`| Sender's name      | John Smith     |
| `{{from_email}}` | Sender's email   | john@example.com |
| `{{mobile}}`   | Mobile number      | +61 400 000 000 |
| `{{restaurant}}` | Restaurant name  | The Local Kitchen |
| `{{message}}`  | Message text       | I'd like to know more... |
| `{{to_email}}` | Recipient (optional) | contact@resgro.ai |
| `{{reply_to}}` | Reply-to address (optional) | Same as from_email |

---

## What to change in EmailJS

1. Go to **https://dashboard.emailjs.com** → **Email Templates** → open your template (e.g. `template_cpdnc38`).
2. Set the **Subject** to something like:
   ```
   Contact Us: {{from_name}}
   ```
3. In the **Content** (body), use the variables above. For example:

### Option A – Simple (plain text style)

**Content:**
```
New contact form submission from RESGRO website.

Name: {{from_name}}
Email: {{from_email}}
Mobile: {{mobile}}
Restaurant: {{restaurant}}

Message:
{{message}}

---
Reply to: {{from_email}}
```

### Option B – HTML template (paste into HTML tab)

**Subject:** `Contact Us: {{from_name}}`

**Content (HTML):**
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #FF6B35;">New Contact Form – RESGRO</h2>
  
  <p><strong>Name:</strong> {{from_name}}</p>
  <p><strong>Email:</strong> {{from_email}}</p>
  <p><strong>Mobile:</strong> {{mobile}}</p>
  <p><strong>Restaurant:</strong> {{restaurant}}</p>
  
  <p><strong>Message:</strong></p>
  <div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #FF6B35; white-space: pre-wrap;">{{message}}</div>
  
  <p style="margin-top: 20px; color: #666; font-size: 12px;">Reply to: {{from_email}}</p>
</div>
```

---

## Checklist

- [ ] Template uses **exactly**: `{{from_name}}`, `{{from_email}}`, `{{mobile}}`, `{{restaurant}}`, `{{message}}` (double curly braces, no spaces inside).
- [ ] No typo in variable names (e.g. `from_name` not `fromName` or `name`).
- [ ] Save the template in EmailJS after editing.

After you update the template, submit the form again; the email should show Name, Email, Mobile, Restaurant, and Message.
