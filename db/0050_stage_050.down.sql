DROP TRIGGER waterway_path_simplified_change_trigger ON waterway;
DROP TRIGGER waterway_path_simplified_trigger ON waterway;
DROP FUNCTION path_simplified_changed();
DROP FUNCTION set_waterway_path_simplified();
ALTER TABLE waterway DROP COLUMN path_simplified;