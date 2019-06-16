ALTER TABLE waterway
    ADD COLUMN path_simplified geometry,
    ADD CONSTRAINT path_simplified_is_linestring CHECK (GeometryType(path_simplified) = 'LINESTRING');

UPDATE waterway SET path_simplified = ST_Simplify(path, 0.0005, FALSE);
DELETE from waterway where ST_IsEmpty(path);

ALTER TABLE waterway
    ALTER COLUMN path_simplified SET NOT NULL;

CREATE OR REPLACE FUNCTION set_waterway_path_simplified()
    RETURNS trigger AS $BODY$
    BEGIN
        NEW.path_simplified = ST_Simplify(NEW.path, 0.0005, FALSE);
        RETURN NEW;
    END$BODY$ LANGUAGE 'plpgsql';

CREATE OR REPLACE FUNCTION path_simplified_changed()
    RETURNS trigger AS $BODY$
    BEGIN
        RAISE EXCEPTION 'path_simplified modified directly';
    END$BODY$ LANGUAGE 'plpgsql';

CREATE TRIGGER waterway_path_simplified_trigger
    BEFORE UPDATE OF "path" OR INSERT ON waterway
    FOR EACH ROW
EXECUTE PROCEDURE set_waterway_path_simplified();

CREATE TRIGGER waterway_path_simplified_change_trigger
    BEFORE UPDATE OF "path_simplified" ON waterway
    FOR EACH ROW
EXECUTE PROCEDURE path_simplified_changed();

ALTER TABLE "user" ADD COLUMN experimental_features BOOLEAN NOT NULL DEFAULT FALSE;
