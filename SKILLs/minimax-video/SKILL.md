---
name: minimax-video
description: Generate videos with MiniMax from text prompts using the global or China API.
official: true
version: 1.0.0
---

# MiniMax video generation

Use the bundled script to create a text-to-video task, poll it, and download the
completed MP4 file.

Set `MINIMAX_API_KEY`, then run:

```bash
node "$SKILLS_ROOT/minimax-video/scripts/generate_video.js" \
  --prompt "A paper boat crossing a moonlit lake" \
  --output minimax-video.mp4
```

The default model is `MiniMax-H3`, which uses `/v2/video_generation` with 2K
resolution and a duration from 4 to 15 seconds. Use `--region cn` for the China
endpoint. The script sends Bearer authentication, polls the returned task id,
and downloads `task.content.url` when the task succeeds.
