-- Keep the widget key itself (not only its hash) so Settings can copy a script for any style at
-- any time, without making a new key that turns off the widgets already on the Home Screen.
-- The key only reads a short summary, and kita tables are closed to browsers; only the API reads it.
alter table kita.widget_keys add column key text;
