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


UI alert management interface:

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

### Categories
When managing alerts, you can assign each alert to an existing category or create a new one.

You cannot edit or delete a category.
If you want to modify a category, create the new category you want and move the alerts into it.

Categories that do not contain any alerts are automatically deleted.


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

## Example auto visualisation for all alerts:
```jinja2
type: custom:auto-entities
card:
  type: vertical-stack
card_param: cards
show_empty: true
sort:
  reverse: false
  numeric: false
  ignore_case: false
  ip: false
  method: last_changed
filter:
  include:
    - options:
        type: custom:mushroom-template-card
        entity: this.entity_id
        primary: |
          {{ state_attr(entity, 'friendly_name') }}
        icon: |-
          {% if state_attr(entity, 'ack') == true %}
            mdi:pause-circle-outline
          {% else%}
            {{ state_attr(entity, 'icon') }}
          {% endif %}
        icon_color: |-
          {% if state_attr(entity, 'ack') == true %}
            blue
          {% elif state_attr(entity, 'level') == "error" %}
            #db4437
          {% elif state_attr(entity, 'level') == "warning" %}
            #ffa600
          {% elif state_attr(entity, 'level') == "info" %}
            blue
          {% endif %}
        secondary: |
          {{ state_attr(entity, 'description') }}
        grid_options:
          columns: full
          rows: 1
        tap_action:
          action: more-info
        hold_action:
          action: perform-action
          perform_action: alertsys.ack_toggle
          data:
            entity_id: this.entity_id
        double_tap_action:
          action: none
        badge_icon: |-
          {% if state_attr(entity, 'auto_quit') == false %}
            {% if state_attr(entity, 'condition') == true %}
              mdi:close
            {% else %}
              mdi:check
            {% endif %}
          {% endif %}
        badge_color: |-
          {% if state_attr(entity, 'condition') == true %}
            #db4437
          {% else %}
            green
          {% endif %}
        card_mod:
          style:
            mushroom-shape-icon$: |
              .shape {
                background: transparent !important;
              }
            .: |
              ha-card {
                {% set level = state_attr(config.entity, 'level') %}
                {% if level == "error" %}
                  background: rgba(var(--rgb-error-color), 0.3);
                {% elif level == "warning" %}
                  background: rgba(var(--rgb-warning-color), 0.3);
                {% elif level == "info" %}
                  background: rgba(var(--rgb-info-color), 0.3);
                {% endif %}
              }
      integration: alertsys
      domain: binary_sensor
      state: "on"
```
## Dynamic description
If you want to display dynamic data in the description, use the following secondary field code:

```jinja2
secondary: >
          {% set desc = state_attr(entity, 'description') | default('', true) %}
          {% set data = desc | from_json(None) %}

          {% if (data is mapping and data.p is defined) or (data is sequence and
          data is not string) %}
            {% set base = (data.b if data is mapping and data.b is defined else '') | default('', true) %}
            {% set parts = (data.p if data is mapping else data) %}
            {% set out = namespace(text='') %}

            {% for part in parts %}
              {# TEXT: {"t":"..."} #}
              {% if part is mapping and part.t is defined %}
                {% set out.text = out.text ~ (part.t | default('', true)) %}

              {# ENTITY: {"ei":"...", "r":1, "u":1} #}
              {% elif part is mapping and part.ei is defined %}
                {% set eid = (part.ei | string) %}
                {% if base and '.' not in eid %}
                  {% set eid = base ~ eid %}
                {% endif %}

                {% set r = part.r if part.r is defined else none %}
                {% set u = (part.u if part.u is defined else 1) | int %}
                {% set fb = part.fb if part.fb is defined else '—' %}

                {% set raw = states(eid, rounded=false, with_unit=false) %}
                {% if raw in ['unknown','unavailable','none',''] %}
                  {% set out.text = out.text ~ fb %}
                {% else %}
                  {% set val = raw %}
                  {% if r is not none %}
                    {% set num = raw | float(none) %}
                    {% if num is not none %}
                      {% set val = num | round(r) %}
                    {% endif %}
                  {% endif %}

                  {% set val = val | string %}

                  {% if u %}
                    {% set unit = state_attr(eid, 'unit_of_measurement') %}
                    {% if unit %}
                      {% set val = val ~ ' ' ~ unit %}
                    {% endif %}
                  {% endif %}

                  {% set out.text = out.text ~ val %}
                {% endif %}
              {% endif %}
            {% endfor %}

            {{ out.text }}
          {% else %}
            {{ desc }}
          {% endif %}
```

After that, the alert description can be used as follows:

Example 1:
```jinja2
{"p":[
{"t":"Incoming water pressure too low: "},
{"ei":"sensor.gleantemp_pressure","r":1}
]}
```

Example 2 (if you need multiple similar sensors, then:):
```jinja2
{"b":"sensor.gleansmartmeter_voltage_","p":[
{"t":"Low voltage! L1: "},{"ei":"l1","r":0},
{"t":" - L2: "},{"ei":"l2","r":0},
{"t":" - L3: "},{"ei":"l3","r":0}
]}
```

Example 3 (string value sensor):
```jinja2
{"p":[
{"t":"Detected dock error is: "},
{"ei":"sensor.roborock_s7_maxv_dock_dock_error"}
]}
```

Where:
- "p" = part
- "t" = text
- "ei" = entity
- "r" = round
- "b" = base

> Note: In addition to using the new secondary field, plain text descriptions can also be provided, the code will handle it if it receives a plain string value.

## Troubleshooting

Panel shows but actions fail → use an admin account (WebSocket CRUD is admin-only).
No notify targets available → ensure at least one notify.* integration exists (e.g. mobile app, telegram, etc.).
Template errors → use the built-in template validation in the editor (status appears under template fields).

## Support / Issues

Please open bugs and feature requests in the repository issue tracker.
