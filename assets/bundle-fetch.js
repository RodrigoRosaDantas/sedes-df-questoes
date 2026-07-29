(() => {
  const nativeFetch = window.fetch.bind(window);
  const bundleUrl = new URL("./data/materiais.bundle.b64", window.location.href).href;
  const chunks = Array.from({length: 12}, (_, index) =>
    new URL(`./data/bundle/part-${String(index + 1).padStart(2, "0")}.txt`, window.location.href).href
  );

  window.fetch = async (input, init = {}) => {
    const requestedUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url, window.location.href).href;
    if (requestedUrl !== bundleUrl) return nativeFetch(input, init);

    const responses = await Promise.all(chunks.map(url => nativeFetch(url, {...init, cache: "no-store"})));
    const failed = responses.find(response => !response.ok);
    if (failed) return new Response("", {status: failed.status, statusText: failed.statusText});
    const content = (await Promise.all(responses.map(response => response.text()))).map(part => part.trim()).join("");
    return new Response(content, {
      status: 200,
      headers: {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"}
    });
  };
})();
