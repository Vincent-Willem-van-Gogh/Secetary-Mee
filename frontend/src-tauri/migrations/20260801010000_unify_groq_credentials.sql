-- Keep one Groq credential in settings. Existing summary credentials win.
INSERT INTO settings (id, provider, model, whisperModel, groqApiKey)
SELECT '1', 'builtin-ai', 'qwen3.5:2b', 'large-v3', NULLIF(TRIM(groqApiKey), '')
FROM transcript_settings
WHERE id = '1' AND NULLIF(TRIM(groqApiKey), '') IS NOT NULL
ON CONFLICT(id) DO UPDATE SET groqApiKey =
    CASE
        WHEN settings.groqApiKey IS NULL OR TRIM(settings.groqApiKey) = ''
        THEN excluded.groqApiKey
        ELSE settings.groqApiKey
    END;

UPDATE transcript_settings SET groqApiKey = NULL WHERE id = '1';
