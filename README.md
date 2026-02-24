# AlertSys (Home Assistant)

**AlertSys** is a custom Home Assistant integration that turns any boolean condition (entity state or a Jinja2 template) into a managed **alert** with an **acknowledge (mute)** workflow, optional **auto-quit**, **categories**, and **repeat notifications** — plus built-in counters per severity.

It also adds an **“Alert Manager”** panel to the HA sidebar for creating and maintaining alerts from the UI.

---

## Features

- **Alert entities**: each alert is an entity: `alertsys.<alert_id>`
  - State: `true` / `false` (active or idle)
  - Attributes:
    - `level`: `info` / `warning` / `error`
    - `condition`: `true` / `false` (whether the trigger is currently active)
    - `ack`: `true` / `false` (acknowledged / muted)
    - `description`: (255char custom description for alerts)
- **Two-stage lifecycle** (the workflow most people want):
  - Trigger becomes active → alert becomes **active**
  - Trigger clears → alert can either **auto-quit** (reset) or remain active until manually **quit**
- **Acknowledge / unacknowledge** (mute while still active)
  - Acknowledged alerts remain active, but stop repeat notifications
- **Categories** (like HA’s built-in grouping style)
- **Notifications**
  - Send to one or more `notify.*` targets
  - Optional repeat count and interval
  - Optional “resolve” notification when the condition clears
  - Jinja2 templates in title/message (with a test button in the UI)
- **Counters**
  - `alertsys.info_count`
  - `alertsys.warning_count`
  - `alertsys.error_count`

> Note: Alert management WebSocket commands are **admin-only**. You’ll need an admin user to create/update/delete alerts and to use the panel fully.

> For the full user experience, we recommend using the `Mushroom`, `auto-entities`, and `card-mod` add-ons for visual display.
> Sample code at the bottom of the description.

---
## Preview
Automatic visualisation alerts by recommended addons:
<img width="631" height="270" alt="image" src="https://github.com/user-attachments/assets/bc84fb11-72d6-48c9-a630-bfaf3e2e51c2" />

<img width="1013" height="581" alt="image" src="https://github.com/user-attachments/assets/2804ce55-244a-4361-a0c0-0d7dc245bdb3" />



## Installation

### Option A) HACS (Custom repository)
1. Open **HACS → Integrations**
2. Click the **⋮** menu (top right) → **Custom repositories**
3. Add your repository URL (e.g. `https://github.com/gleanlux/alertsys`)
4. Category: **Integration**
5. Install **AlertSys**
6. Restart Home Assistant

### Option B) Manual installation
1. Copy the integration folder into your HA config:
   - `config/custom_components/alertsys/`

2. Restart Home Assistant

---

## Setup

1. Go to **Settings → Devices & Services**
2. Click **Add Integration**
3. Search for **AlertSys**
4. Finish the (minimal) setup flow

After setup, you’ll get a sidebar entry:
- **Alert Manager** (URL: `/alertsys`)

---

## Creating an alert

Open **Alert Manager → + New Alert** and fill:

### Name
The alert's 'friendly name' 

### Entity ID (OPTIONAL)
If you leave the field blank, the Entity ID will be automatically generated from the friendly name!
The parameter can be freely modified and is equipped with collision protection.

### Condition
You can use either:

- **Entity ID** (treated as boolean)
- `binary_sensor.door`
- `input_boolean.pump_fault`
- The alert triggers when the entity state is `on` / `true` / `1`

**or**

- **Jinja2 template** (must evaluate to boolean)
- `{{ states('sensor.temperature') | float > 30 }}`
- `{{ is_state('binary_sensor.door', 'on') and is_state('input_boolean.armed', 'on') }}`

### Auto Quit
- If enabled: the alert resets automatically when the condition clears
- If disabled: the alert stays active after the condition clears until you **quit** it

Default behavior by level:
- `info`: auto-quit **on**
- `warning`: auto-quit **on**
- `error`: auto-quit **off**

You can override per alert in the UI.

---

## Services

AlertSys exposes these services under the `alertsys` domain:

- `alertsys.quit`
- Resets alerts to idle **only if the condition is no longer active**
- If `entity_id` is omitted, it quits **all eligible** alerts

- `alertsys.ack`
- Acknowledge (mute) an active alert

- `alertsys.unack`
- Remove acknowledgement (may resume repeats if condition is still true)

- `alertsys.ack_toggle`
- Toggle ack state

You’ll find them in **Developer Tools → Services**.

---

## Notification templating variables

When templating notification title/message, these variables are available:

- `name`
- `level`
- `condition`
- `entity_id`
- `alert_id`
- `count` (notification count)
- `triggered_at`

Example title:
```jinja2
AlertSys {{ level | upper }}: {{ name }}
```

Example notification data:
```jinja2
{
"ttl": 0,
"priority":"high",
"channel":"alarm_stream"
}
```

## Troubleshooting

Panel shows but actions fail → use an admin account (WebSocket CRUD is admin-only).
No notify targets available → ensure at least one notify.* integration exists (e.g. mobile app, telegram, etc.).
Template errors → use the built-in template validation in the editor (status appears under template fields).

## Support / Issues

Please open bugs and feature requests in the repository issue tracker.
