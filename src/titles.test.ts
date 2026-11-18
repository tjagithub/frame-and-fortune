import { describe, expect, test } from "bun:test";
import { itemsFromPaths, extractIds } from "./library";
import { search, score } from "./fuzzy";
import { parseName } from "./titles";
import { pattern } from "./game";

describe("parseName", () => {
  const cases: [string, ReturnType<typeof parseName>][] = [
    ["/m/The.Matrix.1999.1080p.BluRay.x264-GRP.mkv", { title: "The Matrix", year: 1999 }],
    ["/m/Blade Runner 2049 (2017)/Blade Runner 2049 (2017).mkv", { title: "Blade Runner 2049", year: 2017 }],
    ["/m/2001.A.Space.Odyssey.1968.2160p.mkv", { title: "2001 A Space Odyssey", year: 1968 }],
    ["/m/1917 (2019).mp4", { title: "1917", year: 2019 }],
    ["/m/Heat [1995] [Remastered].mkv", { title: "Heat", year: 1995 }],
    ["/m/Amélie (2001)/movie.mkv", { title: "Amélie", year: 2001 }],
    ["/m/alien.mkv", { title: "Alien" }],
    ["/tv/Breaking.Bad.S02E05.720p.mkv", { title: "Breaking Bad", season: 2, episode: 5 }],
    ["/tv/The Wire/Season 1/S01E03 - The Buys.mkv", { title: "The Wire", season: 1, episode: 3 }],
    ["/tv/Doctor Who (2005)/Doctor.Who.2005.1x04.mkv", { title: "Doctor Who", year: 2005, season: 1, episode: 4 }],
  ];
  for (const [path, want] of cases) test(path, () => expect(parseName(path)).toEqual(want as never));

  test("skips extras", () => {
    expect(parseName("/m/Heat (1995)/Heat-sample.mkv")).toBeNull();
    expect(parseName("/m/Heat (1995)/Heat.Trailer.mp4")).toBeNull();
  });
});

describe("itemsFromPaths", () => {
  test("groups episodes per show and versions per film", () => {
    const items = itemsFromPaths([
      "/tv/Show.Name.S01E01.mkv",
      "/tv/Show Name/Season 2/Show Name - S02E03.mkv",
      "/m/Heat (1995).mkv",
      "/m/Heat.1995.2160p.mkv",
      "/m/Heat (1986).mkv",
    ]);
    const tv = items.find((i) => i.kind === "tv")!;
    expect(tv.paths).toHaveLength(2);
    expect(items.filter((i) => i.kind === "film").map((i) => i.paths!.length).sort()).toEqual([1, 2]);
  });
});

describe("fuzzy", () => {
  const titles = ["The Matrix", "The Matrix Reloaded", "Mad Max: Fury Road", "Memento", "Amélie"];
  test("prefix and article-free", () => expect(search("matrix", titles, (t) => t)[0]).toBe("The Matrix"));
  test("typos", () => expect(search("mad mx fury", titles, (t) => t)[0]).toBe("Mad Max: Fury Road"));
  test("diacritics", () => expect(search("amelie", titles, (t) => t)).toEqual(["Amélie"]));
  test("junk scores low", () => expect(score("zzzz", "Memento")).toBeLessThan(25));
});

test("extractIds from links and takeout csv", () => {
  const text = `Video ID,Playlist Video Creation Timestamp
dQw4w9WgXcQ,2024-01-01T00:00:00+00:00
https://youtu.be/9bZkp7q19f0 and https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3`;
  expect(extractIds(text).sort()).toEqual(["9bZkp7q19f0", "dQw4w9WgXcQ"]);
});

test("pattern hides unrevealed letters only", () => {
  expect(pattern("Mad Max: 2", [0, 4], 2)).toBe("M__ M__: _");
});
