# Audio decoder fixtures

These short, 440 Hz sine waves were generated with FFmpeg from its `sine` source at
44.1 kHz, mono, with metadata removed. They contain no third-party recording.
The Rust tests decode the committed bytes and do not require FFmpeg.

Most fixtures are 150 ms; MP2 uses 500 ms at 192 kbps.

Codecs: PCM s16le (WAV), PCM s16be (AIFF), FLAC, MP3, MP2, Vorbis (Ogg), AAC-LC
(M4A), ALAC (M4A), PCM s16le (CAF), and IMA ADPCM (WAV).

Generation arguments: `-f lavfi -i sine=frequency=440:sample_rate=44100:duration=0.15
-map_metadata -1 -c:a <codec> <fixture>`.
