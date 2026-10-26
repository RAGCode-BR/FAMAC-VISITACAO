CREATE TABLE IF NOT EXISTS famac.notifications (
  id uuid PRIMARY KEY,
  recipient_team_id text NOT NULL,
  opportunity_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind = 'seller_assigned'),
  work_name text NOT NULL,
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created
  ON famac.notifications(recipient_team_id, created_at DESC);
REVOKE ALL ON famac.notifications FROM PUBLIC;
