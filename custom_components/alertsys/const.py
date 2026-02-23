"""Constants for the AlertSys integration."""

DOMAIN = "alertsys"
ALERT_ENTITY_DOMAIN = "binary_sensor"
ALERT_OBJECT_ID_PREFIX = "alertsys_"
STORAGE_KEY = f"{DOMAIN}.storage"
STORAGE_VERSION = 1

# Alert config keys
CONF_ALERTS = "alerts"
CONF_NAME = "name"
CONF_LEVEL = "level"
CONF_CONDITION = "condition"
CONF_AUTO_QUIT = "auto_quit"
CONF_CATEGORY_ID = "category_id"
CONF_DESCRIPTION = "description"

# Levels
LEVEL_INFO = "info"
LEVEL_WARNING = "warning"
LEVEL_ERROR = "error"
VALID_LEVELS = {LEVEL_INFO, LEVEL_WARNING, LEVEL_ERROR}

# Default auto_quit per level
AUTO_QUIT_DEFAULTS = {
    LEVEL_INFO: True,
    LEVEL_WARNING: True,
    LEVEL_ERROR: False,
}

# Entity attributes
ATTR_CONDITION = "condition"
ATTR_ACK = "ack"
ATTR_LEVEL = "level"
ATTR_AUTO_QUIT = "auto_quit"
ATTR_DESCRIPTION = "description"

# Service names
SERVICE_QUIT = "quit"
SERVICE_ACK = "ack"
SERVICE_UNACK = "unack"
SERVICE_ACK_TOGGLE = "ack_toggle"

# Counter entity IDs
COUNTER_ENTITY_IDS = {
    LEVEL_INFO: "info_count",
    LEVEL_WARNING: "warning_count",
    LEVEL_ERROR: "error_count",
}

# Default category
DEFAULT_CATEGORY_ID = "default"
DEFAULT_CATEGORY_NAME = "Uncategorized"

# Notification defaults
NOTIF_DEFAULT_TITLE = "AlertSys {{ level | upper }}: {{ name }}"
NOTIF_DEFAULT_MESSAGE = "Alert '{{ name }}' triggered"
NOTIF_DEFAULT_RESOLVE_MESSAGE = "Alert '{{ name }}' - condition cleared"
NOTIF_DEFAULT_REPEAT_INTERVAL_SEC = 60
