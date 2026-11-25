// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The fixed choices behind the README pictures in `docs/images`, and the small
 * pure steps `scripts/captureReadmePictures.mjs` builds from them: the address
 * each picture is taken at, the file each one is written to and the arguments
 * of the two programs that turn a recording into a GIF. Nothing here touches
 * the network or the disk, so a test can read all of it.
 */

/** The deployed reference site's map, the one page the pictures are taken from. */
export const LIVE_MAP_URL = "https://mapcairn.com/map";

/** The size of each still, in CSS pixels, at one device pixel per pixel. */
export const STILL_SIZE = Object.freeze({ width: 1440, height: 900 });

/** The size of each finished GIF, in pixels. The page is recorded at {@link STILL_SIZE} and scaled down to it. */
export const DEMO_SIZE = Object.freeze({ width: 960, height: 600 });

/** The frame rate of the finished GIFs. */
export const GIF_FPS = 10;

/** The `gifski` quality, 1 to 100, chosen to keep each GIF near 700 KB. */
export const GIF_QUALITY = 60;

/** The view of both stills and of the start of the recordings: Africa, centred a little south of the equator. */
export const START_VIEW = Object.freeze({
  zoom: 3.6,
  latitude: -2.1,
  longitude: 20,
});

/**
 * The two points the measured line joins in the stills, in pixels of
 * {@link STILL_SIZE}: the south of Africa to the north of Lake Victoria.
 */
export const STILL_LINE = Object.freeze([
  Object.freeze({ x: 630, y: 672 }),
  Object.freeze({ x: 800, y: 392 }),
]);

/** The themes the pictures are taken in, with the colour scheme the page is asked for. */
export const THEMES = Object.freeze(["light", "dark"]);

/**
 * The map address for a view, with the earthquakes layer on for the past week.
 *
 * @param {{ zoom: number, latitude: number, longitude: number }} view
 * @param {boolean} [withLayer] Whether to turn the earthquakes layer on.
 * @returns {string}
 */
export function liveMapUrl(view, withLayer = true) {
  const map = `map=${view.zoom.toFixed(2)}/${view.latitude.toFixed(5)}/${view.longitude.toFixed(5)}`;
  if (!withLayer) {
    return `${LIVE_MAP_URL}#${map}`;
  }
  return `${LIVE_MAP_URL}#layers=earthquakes&earthquakes.window=week&${map}`;
}

/**
 * The file a still of a theme is written to, in the given folder.
 *
 * @param {string} folder
 * @param {string} theme
 * @returns {string}
 */
export function stillPath(folder, theme) {
  return `${folder}/playground-${theme}.png`;
}

/**
 * The file a recording of a theme is written to, in the given folder. The
 * light one has no theme in its name, as `README.md` refers to it.
 *
 * @param {string} folder
 * @param {string} theme
 * @returns {string}
 */
export function demoPath(folder, theme) {
  return theme === "light"
    ? `${folder}/playground-demo.gif`
    : `${folder}/playground-demo-${theme}.gif`;
}

/**
 * The `ffmpeg` arguments that turn a recording into numbered PNG frames at the
 * GIF's frame rate and size, leaving out the first seconds, in which the map
 * is still loading.
 *
 * @param {string} video
 * @param {string} framesFolder
 * @param {number} startSeconds
 * @returns {string[]}
 */
export function ffmpegFrameArgs(video, framesFolder, startSeconds) {
  return [
    "-v",
    "error",
    "-ss",
    startSeconds.toFixed(1),
    "-i",
    video,
    "-vf",
    `fps=${GIF_FPS},scale=${DEMO_SIZE.width}:${DEMO_SIZE.height}:flags=lanczos`,
    `${framesFolder}/frame-%04d.png`,
  ];
}

/**
 * The `gifski` arguments that join the given frame files, in order, into one
 * looping GIF. `gifski` does not expand a pattern itself, so the files are
 * named one by one.
 *
 * @param {string[]} frames
 * @param {string} output
 * @returns {string[]}
 */
export function gifskiArgs(frames, output) {
  return [
    "--fps",
    String(GIF_FPS),
    "--quality",
    String(GIF_QUALITY),
    "--width",
    String(DEMO_SIZE.width),
    "--output",
    output,
    ...frames,
  ];
}
