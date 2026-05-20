async function request(
  url,
  options = {}
) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },

    ...options,
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status}`
    );
  }

  return response.json();
}

export const api = {
  request,
};

export default api;