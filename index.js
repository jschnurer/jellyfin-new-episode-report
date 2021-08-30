const settings = require("./local.settings.json");
const fetch = require("node-fetch");
const fs = require("fs");
const forkObj = require('child_process').fork;
const path = require("path");

const outputFn = "./output.txt";
const ignoreFn = "./ignored-shows.json";

let ignoredJellyfinShows = [];

if (fs.existsSync(ignoreFn)) {
  const ignoredJson = fs.readFileSync(ignoreFn, 'utf8');
  ignoredJellyfinShows = JSON.parse(ignoredJson);
}

const jUrl = settings.jellyfin.apiUrl;
const jUserId = settings.jellyfin.justinUserId;
const jKey = settings.jellyfin.apiKey;
const jTvId = settings.jellyfin.tvShowFolderId;

// New episode info.
const newEps = [];
// Next episode info for shows that I have up-to-date.
const nextAirs = [];
// Errors that might have occurred.
const errors = [];
// The TMDB ids and names of shows that have permanently ended.
const endedShows = [];

async function runUpdate() {
  const shows = await getAllJellyfinShows();

  for (let i = 0; i < shows.length; i++) {
    if (ignoredJellyfinShows.some(x => x.id === shows[i].Id)) {
      continue;
    }

    console.log(`(${i + 1}/${shows.length}) Processing '${shows[i].Name}'.`);

    if (i === 18) {
      debugger;
    }

    await processShow(shows[i]);
  }

  console.log("Finished processing.");

  let output = '';

  // Output new episode info.
  output += '=== NEW EPISODES ==============================\n';
  output += newEps.sort(alphaSort).join('\n');
  output += '\n\n';

  output += '=== UPCOMING EPS ==============================\n';
  output += nextAirs.sort(alphaSort).join('\n');
  output += '\n\n';

  output += '=== ENDED SHOWS ===============================\n';
  output += endedShows.sort(alphaSort).join('\n');
  output += '\n\n';

  output += '=== ERRORS ====================================\n';
  output += errors.sort(alphaSort).join('\n');
  output += '\n\n';

  fs.writeFileSync(outputFn, output, 'utf8');

  console.log(`Output written to ${outputFn}.`);

  if (ignoredJellyfinShows.length) {
    // Write out the shows to ignore next time.
    fs.writeFileSync(ignoreFn,
      JSON.stringify(ignoredJellyfinShows.sort((a, b) => a.name < b.name ? -1 : 1), null, 2),
      'utf8')

    console.log(`Ignored list updated in ${ignoreFn}.`);
  }

  progToOpen = forkObj('C:\\windows\\notepad.exe',
    [path.resolve(outputFn)]);
}

async function getAllJellyfinShows() {
  const resp = await fetch(`${jUrl}/users/${jUserId}/items/?fields=ProviderIds&parentid=${jTvId}&api_key=${jKey}`);
  return (await resp.json()).Items;
}

async function processShow(show) {
  const latestEp = await getNewestEpisode(show.Id);
  const myNewest = latestEp
    ? latestEp.shorthand
    : '';

  if (myNewest == '') {
    errors.push(`${show.Name} doesn't seem to have any episodes in Jellyfin.`);
    return;
  }

  const tmdb = show.ProviderIds
    ? show.ProviderIds.Tmdb
    : null;

  if (!tmdb) {
    errors.push(`${show.Name} doesn't have a TMDB Id.`);
    return;
  }

  try {
    const dbInfo = await getLatestEpFromMovieDb(tmdb);

    if (dbInfo.newestEp !== myNewest) {
      newEps.push(`${show.Name} ${myNewest} -> ${dbInfo.newestEp}`);
    } else if (dbInfo.nextEp) {
      nextAirs.push(`${show.Name} ${myNewest} -> ${dbInfo.nextEp}`);
    } else if (dbInfo.status === 'Ended'
      || dbInfo.status === 'Canceled') {
      endedShows.push(show.Name);
      ignoredJellyfinShows.push({
        name: show.Name,
        id: show.Id,
      });
    }

  } catch (err) {
    errors.push(`${show.Name} failed to get TMDB info: ${err}`);
  }
}

async function getNewestEpisode(showId) {
  const resp = await fetch(`${jUrl}/shows/${showId}/episodes?api_key=${jKey}&userid=${jUserId}&fields=path`);
  const json = await resp.json();

  const eps = json.Items
    .map(x => ({
      season: x.ParentIndexNumber,
      episode: x.IndexNumber,
      name: x.Name,
      path: x.Path,
      shorthand: `${x.ParentIndexNumber}x${x.IndexNumber.toString().padStart(2, '0')}`,
    })).sort((a, b) => {
      if (a.season < b.season) {
        return -1;
      } else if (a.season > b.season) {
        return 1;
      }

      return a.episode < b.episode
        ? -1
        : 1;
    });

  if (eps.length) {
    return eps[eps.length - 1];
  }

  return null;
}

async function getLatestEpFromMovieDb(showId) {
  const result = await fetch(`https://api.themoviedb.org/3/tv/${showId}?api_key=${settings.movieDbApiKey}`);
  const data = await result.json();
  const newestEp = data.last_episode_to_air;
  const nextEp = data.next_episode_to_air;
  const status = data.status;

  if (!newestEp) {
    return null;
  }

  const info = {
    status,
    newestEp: `${newestEp.season_number}x${newestEp.episode_number.toString().padStart(2, '0')}`,
  };

  if (nextEp) {
    info.nextEp = `${nextEp.season_number}x${nextEp.episode_number.toString().padStart(2, '0')} on ${nextEp.air_date}`;
  }

  return info;
}

function alphaSort(a, b) {
  return a < b ? -1 : 1;
}

runUpdate();