ALTER TABLE transcript_settings
ADD COLUMN translationModel TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile';

ALTER TABLE transcripts ADD COLUMN translation_zh_cn TEXT;
ALTER TABLE transcripts ADD COLUMN translation_provider TEXT;
ALTER TABLE transcripts ADD COLUMN translation_model TEXT;
