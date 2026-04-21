-- V12: Card media support for image attachments and image occlusion cards
CREATE TABLE card_media (
    id          TEXT PRIMARY KEY,
    card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    file_name   TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    file_size   INTEGER,
    storage_key TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX idx_card_media_card_id ON card_media(card_id);
