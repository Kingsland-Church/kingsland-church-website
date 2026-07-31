/* TEMPORARY — delete after testing */
exports.handler = async function () {
  const res = await fetch('https://api.churchsuite.com/v2/events/events?per_page=3', {
    headers: {
      'X-Auth-Token': process.env.CHURCHSUITE_API_KEY,
      'X-Account':    process.env.CHURCHSUITE_ACCOUNT,
      'Content-Type': 'application/json',
    },
  });

  const text = await res.text();
  return {
    statusCode: res.status,
    headers: { 'Content-Type': 'application/json' },
    body: text,
  };
};
