
export function updateUrlParameters(url: URL, parameters) {
  Object.entries(parameters).forEach(
    ([key, value]) => url.searchParams.set(
      key,
      String(value),
    ),
  )
  return url;
}
