(() => {
  const previousFetch = window.fetch.bind(window);
  const bundleUrl = new URL("./data/materiais.bundle.b64", window.location.href).href;
  const updateUrl = new URL("./data/updates/update-2026-07-29.json", window.location.href).href;

  const toBytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));

  const toBase64 = bytes => {
    let binary = "";
    const size = 0x8000;
    for (let index = 0; index < bytes.length; index += size) {
      binary += String.fromCharCode(...bytes.subarray(index, index + size));
    }
    return btoa(binary);
  };

  const gunzipJSON = async encoded => {
    if (typeof DecompressionStream === "undefined") throw new Error("Navegador sem suporte à descompactação do banco.");
    const stream = new Blob([toBytes(encoded)]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  };

  const gzipJSON = async value => {
    if (typeof CompressionStream === "undefined") throw new Error("Navegador sem suporte à atualização compactada do banco.");
    const input = new TextEncoder().encode(JSON.stringify(value));
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
    return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
  };

  const mergeUpdate = (bundle, update) => {
    for (const patch of update.materials || []) {
      let material = bundle.materials.find(item => item.id === patch.id);
      const metadata = Object.fromEntries(Object.entries(patch).filter(([key]) => !["mode", "questoes"].includes(key)));

      if (!material) {
        material = {...metadata, questoes: []};
        bundle.materials.push(material);
      } else {
        Object.assign(material, metadata);
      }

      for (const question of patch.questoes || []) {
        const index = material.questoes.findIndex(item => item.id === question.id || item.codigo === question.codigo);
        if (index >= 0) material.questoes[index] = question;
        else material.questoes.push(question);
      }
    }

    bundle.exported_at = update.updated_at || bundle.exported_at;
    bundle.incremental_update = {
      source: update.source,
      updated_at: update.updated_at,
      patches: (update.materials || []).reduce((total, material) => total + (material.questoes || []).length, 0)
    };
    return bundle;
  };

  window.fetch = async (input, init = {}) => {
    const requestedUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url, window.location.href).href;
    if (requestedUrl !== bundleUrl) return previousFetch(input, init);

    const [bundleResponse, updateResponse] = await Promise.all([
      previousFetch(input, {...init, cache: "no-store"}),
      previousFetch(updateUrl, {cache: "no-store"})
    ]);

    if (!bundleResponse.ok) return bundleResponse;
    if (!updateResponse.ok) return new Response("", {status: updateResponse.status, statusText: updateResponse.statusText});

    try {
      const baseBundle = await gunzipJSON((await bundleResponse.text()).trim());
      const update = await updateResponse.json();
      const merged = mergeUpdate(baseBundle, update);
      return new Response(await gzipJSON(merged), {
        status: 200,
        headers: {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"}
      });
    } catch (error) {
      console.error("Falha ao aplicar atualização incremental:", error);
      return new Response("", {status: 500, statusText: "Falha na atualização incremental"});
    }
  };
})();
