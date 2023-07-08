const settings = require("./local.settings.json");
const fetch = require("node-fetch");

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
    newestEp: `S${newestEp.season_number.toString().padStart(2, '0')}E${newestEp.episode_number.toString().padStart(2, '0')}`,
  };

  if (nextEp) {
    info.nextEp = {
      ep: `S${nextEp.season_number.toString().padStart(2, '0')}E${nextEp.episode_number.toString().padStart(2, '0')}`,
      air_date: nextEp.air_date,
    };
  }

  return info;
}

module.exports = { getLatestEpFromMovieDb };