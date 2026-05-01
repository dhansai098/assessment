CREATE TYPE severity_level AS ENUM ('P0','P1','P2','P3');
CREATE TYPE work_item_status AS ENUM ('OPEN','INVESTIGATING','RESOLVED','CLOSED');
CREATE TYPE component_type AS ENUM ('API','MCP_HOST','CACHE','QUEUE','RDBMS','NOSQL');
CREATE TYPE rca_category AS ENUM ('CONFIG_ERROR','CODE_BUG','INFRA_FAILURE','CAPACITY','DEPENDENCY_FAILURE','HUMAN_ERROR','UNKNOWN');

CREATE TABLE components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type component_type NOT NULL,
  default_severity severity_level NOT NULL DEFAULT 'P2'
);

CREATE TABLE work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id TEXT NOT NULL REFERENCES components(id),
  title TEXT NOT NULL,
  status work_item_status NOT NULL DEFAULT 'OPEN',
  severity severity_level NOT NULL,
  signal_count INT NOT NULL DEFAULT 0,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  mttr_seconds INT,
  debounce_window_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 seconds'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON work_items(status);

CREATE TABLE rcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID UNIQUE NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  incident_start TIMESTAMPTZ NOT NULL,
  incident_end TIMESTAMPTZ NOT NULL,
  category rca_category NOT NULL,
  fix_applied TEXT NOT NULL,
  prevention_steps TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defence-in-depth: DB-level guard preventing CLOSED without RCA
CREATE OR REPLACE FUNCTION enforce_rca_on_close() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'CLOSED' AND OLD.status <> 'CLOSED' THEN
    IF NOT EXISTS (SELECT 1 FROM rcas WHERE work_item_id = NEW.id) THEN
      RAISE EXCEPTION 'Cannot close work item without RCA';
    END IF;
    NEW.end_time := COALESCE(NEW.end_time, now());
    NEW.mttr_seconds := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::int;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_close BEFORE UPDATE ON work_items
FOR EACH ROW EXECUTE FUNCTION enforce_rca_on_close();

INSERT INTO components(id,name,type,default_severity) VALUES
 ('API_GATEWAY_01','API Gateway 01','API','P1'),
 ('MCP_HOST_01','MCP Host 01','MCP_HOST','P1'),
 ('CACHE_CLUSTER_01','Redis Cache Cluster 01','CACHE','P2'),
 ('QUEUE_KAFKA_01','Kafka Queue 01','QUEUE','P1'),
 ('RDBMS_PRIMARY','Postgres Primary','RDBMS','P0'),
 ('NOSQL_MONGO_01','Mongo Cluster 01','NOSQL','P1');
