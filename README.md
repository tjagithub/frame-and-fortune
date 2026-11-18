# Frame and Fortune

A game-show quiz for your own media library. It shows a frame from one of your films, TV episodes or YouTube favourites, partly hidden, and you name the title.

Built with Tauri 2 (Rust), TypeScript, GSAP, three.js and Strudel.

## How to play

- 10 rounds per game. One random round is a **Double Feature**, worth double points.
- Points: **+3** on the first guess, **+2** on the second, **+1** after that. You never score less than 1 point for a right answer.
- Each wrong guess gives a hint: the year, the channel or episode, another frame, then letters of the title.
- **Modes:** *Multiple choice* (6 options, keys 1–6) or *Type it* (fuzzy search over your library).
- **Difficulty:**
  - *Easy*: the whole frame is shown.
  - *Medium*: a black box covers the centre, or half of the frame is hidden.
  - *Hard*: the frame is a mosaic.

### Party Play

**Host Party** turns the window into the big screen. The host plays too, from the big screen. Players take turns guessing, and each wrong guess gives everyone a hint. Each round starts with the next player.

- **Phones on the same Wi-Fi:** scan the QR code on the host screen. The phone needs no app. The host serves the player page on port 7777.
- **Online:** on another computer, open the app and choose **Join Party**, then type the 4-character code. The connection is peer-to-peer (WebRTC). Public Nostr relays connect the players, and the code is also the room password.

## Library

- **Folders:** the app scans for video files of 20 MB or more (`mkv mp4 m4v avi mov wmv webm mpg mpeg ts m2ts flv ogv`).
  - The title comes from the file name, for example `Heat (1995) 1080p.mkv` or `Show.Name.S02E05.mkv`. It does not use an online database.
  - Frames come from 20–80% of the runtime, so you don't get credits or opening titles. The app rejects frames that are mostly black or white.
- **YouTube:** paste a playlist URL, or any text that contains video links or IDs. The app uses the auto-generated thumbnails, not the custom cover image.
  - Playlists need `yt-dlp`.
  - Private lists, such as Liked videos (`list=LL`), also need cookies from your browser.

## Requirements

- [ffmpeg](https://ffmpeg.org) and ffprobe, for frames from local files (`brew install ffmpeg`)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp), optional, for YouTube playlists
- [Bun](https://bun.sh) and a Rust toolchain, to build the app

## Development

```sh
bun install
bun tauri dev          # run the app
bun test               # title parser tests
bun run build          # type-check and build the frontend
cargo test --manifest-path src-tauri/Cargo.toml
bun tauri build        # release bundle
```

CI runs the tests, build and clippy on each push. To make installers for macOS (Apple silicon and Intel), Windows and Linux, push a tag such as `v0.1.0`: the Release workflow attaches them to a draft GitHub release.

The installers are not signed with a developer certificate. On macOS, the first launch is blocked: open **System Settings › Privacy & Security** and choose **Open Anyway**. On Windows, choose **More info › Run anyway** in the SmartScreen dialog.

Binary assets (images, audio, MIDI, fonts) are stored with [Git LFS](https://git-lfs.com). Run `git lfs install` before you clone.

## Licence

Copyright © 2026 TJ Appleby.

This program is free software. You can redistribute it and/or change it under the terms of the [GNU Affero General Public License](LICENSE), version 3 or (at your option) any later version. The music engine, [Strudel](https://strudel.cc), is also AGPL-3.0. The logo font, [Shrikhand](https://fonts.google.com/specimen/Shrikhand), is under the SIL Open Font License 1.1.
