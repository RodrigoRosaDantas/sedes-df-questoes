import crypto from "node:crypto";

const API_KEY = "AIzaSyC1_x7yhWfSwS7plrE1lv4tt8rzOcll8vU";
const PROJECT_ID = "tdas-68014";
const PLATFORM_ID = "sedes-df-questoes";
const probeId = `prod-probe-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const password = `Sedes!${crypto.randomBytes(12).toString("hex")}Aa1`;

const accounts = [];
const createdDocs = [];

const expectStatus = async (response, expected, label) => {
  if (response.status !== expected) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label}: HTTP ${response.status}; esperado ${expected}. ${body.slice(0, 500)}`);
  }
  return response;
};

async function auth(method, body) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${API_KEY}`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase Auth ${method} falhou: HTTP ${response.status}. ${text.slice(0, 500)}`);
  }
  return response.json();
}

const firestoreUrl = path => {
  const encoded = path.split("/").map(segment => encodeURIComponent(segment)).join("/");
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${encoded}`;
};

const firestoreFields = value => ({
  fields: {
    probeId: {stringValue: probeId},
    platform: {stringValue: PLATFORM_ID},
    kind: {stringValue: value},
    createdAt: {timestampValue: new Date().toISOString()},
  },
});

async function writeDoc(path, token, kind) {
  return fetch(firestoreUrl(path), {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(firestoreFields(kind)),
  });
}

async function readDoc(path, token = null) {
  return fetch(firestoreUrl(path), {
    headers: token ? {authorization: `Bearer ${token}`} : {},
  });
}

async function deleteDoc(path, token) {
  return fetch(firestoreUrl(path), {
    method: "DELETE",
    headers: {authorization: `Bearer ${token}`},
  });
}

async function createProbeAccount(label) {
  const email = `sedes.audit.${label}.${probeId}@example.com`;
  const account = await auth("signUp", {email, password, returnSecureToken: true});
  const normalized = {uid: account.localId, idToken: account.idToken, email};
  accounts.push(normalized);
  return normalized;
}

async function cleanup() {
  for (const item of createdDocs.reverse()) {
    try {
      const response = await deleteDoc(item.path, item.token);
      if (![200, 404].includes(response.status)) console.warn(`Cleanup Firestore ${item.path}: HTTP ${response.status}`);
    } catch (error) {
      console.warn(`Cleanup Firestore falhou em ${item.path}:`, error.message);
    }
  }
  for (const account of accounts.reverse()) {
    try {
      await auth("delete", {idToken: account.idToken});
    } catch (error) {
      console.warn(`Cleanup Auth falhou para ${account.uid}:`, error.message);
    }
  }
}

try {
  console.log("Iniciando sonda efêmera das regras Firestore de produção; nenhum token será impresso.");
  const userA = await createProbeAccount("a");
  const userB = await createProbeAccount("b");

  const ownStateA = `users/${userA.uid}/apps/${PLATFORM_ID}/profiles/audit/state/${probeId}`;
  const ownStateB = `users/${userB.uid}/apps/${PLATFORM_ID}/profiles/audit/state/${probeId}`;
  const reportA = `users/${userA.uid}/apps/${PLATFORM_ID}/reportQueue/${probeId}`;
  const outside = `sedesProductionProbe/${probeId}`;

  await expectStatus(await writeDoc(ownStateA, userA.idToken, "state-a"), 200, "A escreve o próprio progresso");
  createdDocs.push({path: ownStateA, token: userA.idToken});
  await expectStatus(await readDoc(ownStateA, userA.idToken), 200, "A lê o próprio progresso");

  await expectStatus(await writeDoc(ownStateB, userB.idToken, "state-b"), 200, "B escreve o próprio progresso");
  createdDocs.push({path: ownStateB, token: userB.idToken});

  await expectStatus(await writeDoc(reportA, userA.idToken, "report-queue"), 200, "A cria item na reportQueue");
  createdDocs.push({path: reportA, token: userA.idToken});
  await expectStatus(await readDoc(reportA, userA.idToken), 200, "A lê o próprio item da reportQueue");

  await expectStatus(await readDoc(ownStateA, userB.idToken), 403, "B não lê o progresso de A");
  await expectStatus(await writeDoc(reportA, userB.idToken, "cross-write"), 403, "B não altera a reportQueue de A");
  await expectStatus(await readDoc(reportA), 403, "visitante não autenticado não lê a reportQueue");
  await expectStatus(await writeDoc(outside, userA.idToken, "outside-users"), 403, "usuário não escreve fora da árvore permitida");

  console.log(`✓ Firestore produção validado: owner permitido, UID cruzado negado, reportQueue operacional e acesso anônimo/externo bloqueado (${probeId}).`);
} finally {
  await cleanup();
  console.log("✓ Sonda de produção removida: documentos efêmeros e contas de teste limpos.");
}
