-- Add batch grouping and carrier shipped count to expected_boxes
ALTER TABLE expected_boxes
  ADD COLUMN IF NOT EXISTS batch_group_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS carrier_shipped_count INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_expected_boxes_batch_group_id ON expected_boxes (batch_group_id);
