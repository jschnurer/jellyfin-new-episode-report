const settings = require("./local.settings.json");
const fetch = require("node-fetch");
const fs = require("fs");
const spawnObj = require('child_process').spawn;
const path = require("path");

const outputFn = settings.outputHtml
  ? "./output.html"
  : "./output.txt";
const ignoreFn = "./ignored-shows.json";
const allShowsFn = "./all-shows.json";
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let ignoredJellyfinShows = [];

if (fs.existsSync(ignoreFn)) {
  const ignoredJson = fs.readFileSync(ignoreFn, 'utf8');
  ignoredJellyfinShows = JSON.parse(ignoredJson);
}

const jUrl = settings.jellyfin.apiUrl;
const jUserId = settings.jellyfin.userId;
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

const allShows = [];

async function runUpdate() {
  const shows = await getAllJellyfinShows();

  for (let i = 0; i < shows.length; i++) {
    allShows.push({
      id: shows[i].Id,
      name: shows[i].Name,
    });

    if (ignoredJellyfinShows.some(x => x.id === shows[i].Id)) {
      continue;
    }

    console.log(`(${i + 1}/${shows.length}) Processing '${shows[i].Name}'.`);

    await processShow(shows[i]);
  }

  console.log("Finished processing.");

  let output = '';

  if (settings.outputHtml) {
    output = getOutputHtml();
	output += `<br /><br />Last run: ${new Date()}`;
  } else {
    output = getOutputText();
	output += `\n\nLast run: ${new Date()}`;
  }

  fs.writeFileSync(outputFn, output, 'utf8');

  console.log(`Output written to ${outputFn}.`);

  if (ignoredJellyfinShows.length) {
    // Write out the shows to ignore next time.
    fs.writeFileSync(ignoreFn,
      JSON.stringify(ignoredJellyfinShows.sort((a, b) => a.name < b.name ? -1 : 1), null, 2),
      'utf8')

    console.log(`Ignored list updated in ${ignoreFn}.`);
  }

  fs.writeFileSync(allShowsFn,
    JSON.stringify(allShows.sort((a, b) => a.name < b.name ? -1 : 1), null, 2),
    'utf8');

  console.log(`All shows written to ${allShowsFn}.`);

  if (settings.spawnWhenFinished.enabled) {
    progToOpen = spawnObj(settings.spawnWhenFinished.program,
      [path.resolve(outputFn)], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  }

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
      newEps.push({
        text: `${show.Name} ${myNewest} → ${dbInfo.newestEp}`,
        show: show.Name,
        myNewest,
        newestEp: dbInfo.newestEp,
      });
    } else if (dbInfo.nextEp) {
      nextAirs.push({
        text: `${show.Name} ${myNewest} → ${dbInfo.nextEp.ep}`,
        show: show.Name,
        myNewest,
        nextEp: dbInfo.nextEp.ep,
        air_date: dbInfo.nextEp.air_date,
      });
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
    info.nextEp = {
      ep: `${nextEp.season_number}x${nextEp.episode_number.toString().padStart(2, '0')}`,
      air_date: nextEp.air_date,
    };
  }

  return info;
}

function alphaSort(a, b) {
  return a < b ? -1 : 1;
}

function groupBy(xs, key) {
  return xs.reduce(function (rv, x) {
    let v = key instanceof Function
      ? key(x)
      : x[key];
    let el = rv.find((r) => r && r.key === v);
    if (el) {
      el.values.push(x);
    } else {
      rv.push({
        key: v,
        values: [x],
      });
    }
    return rv;
  },
    []);
}

function strToDate(dateStr) {
  const parts = dateStr.split("-");
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatTMDBDate(dateStr) {
  return `${days[strToDate(dateStr).getDay()]}, ${dateStr}`;
}

function getOutputText() {
  let output = '';

  output += '=== NEW EPISODES ==============================\n';
  output += newEps.sort(alphaSort).map(x => x.text).join('\n');
  output += '\n\n';

  output += '=== UPCOMING EPS ==============================\n';
  groupBy(nextAirs, "air_date")
    .sort((a, b) => a.key < b.key ? -1 : 1)
    .forEach(group => {
      output += `${formatTMDBDate(group.key)} (${getDaysTil(strToDate(group.key))})::\n${group.values
        .sort((a, b) => a.text < b.text ? -1 : 1)
        .map(x => '  ' + x.text)
        .join('\n')}\n\n`;
    });
  output += '\n\n';

  output += '=== ENDED SHOWS ===============================\n';
  output += endedShows.sort(alphaSort).join('\n');
  output += '\n\n';

  output += '=== ERRORS ====================================\n';
  output += errors.sort(alphaSort).join('\n');
  output += '\n\n';

  return output;
}

function getOutputHtml() {
  let output = '';

  if (settings.outputHtmlTemplate
    && fs.existsSync(settings.outputHtmlTemplate)) {
    output = fs.readFileSync(settings.outputHtmlTemplate, 'utf8');
  } else if (fs.existsSync("./outputTemplate.html")) {
    output = fs.readFileSync("./outputTemplate.html", 'utf8');
  } else {
    throw new Error("No output html template defined and could not find ./outputTemplate.html!");
  }

  output = output.replace(/#NewEpisodes#/g,
    newEps
      .sort(alphaSort)
      .map(x => `<span class="ep-line">
        <span class="show">${x.show}</span>
        <span class="ep">${x.myNewest} → ${x.newestEp}</span>
      </span>`)
      .join('') || "");

  output = output.replace(/#UpcomingEpisodes#/g,
    groupBy(nextAirs, "air_date")
      .sort((a, b) => a.key < b.key ? -1 : 1)
      .map(group => `<div class="upcoming-eps">
          <span class="date">${formatTMDBDate(group.key)} (${getDaysTil(strToDate(group.key))})</span>
          <ul>
          ${group.values
          .sort((a, b) => a.show < b.show ? -1 : 1)
          .map(x => `<li class="ep-line"><span class="show">${x.show}</span> <span class="ep">${x.myNewest} → ${x.nextEp}</span></li>`)
          .join('')
        }
        </ul>
        </div>`)
      .join('') || "");

  output = output.replace(/#EndedShows#/g,
    endedShows.sort(alphaSort).join('<br />') || "");

  output = output.replace(/#Errors#/g,
    errors.sort(alphaSort).join('<br />') || "");

  return output;
}

function getDaysTil(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const numDays = Math.floor((date - today) / (1000 * 3600 * 24));
  return `${numDays} day${numDays === 1 ? "" : "s"}`;
}

runUpdate();