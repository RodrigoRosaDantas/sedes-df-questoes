import fs from "node:fs";
import {initializeTestEnvironment, assertFails, assertSucceeds} from "@firebase/rules-unit-testing";
import {doc, getDoc, setDoc} from "firebase/firestore";

const projectId = "tdas-68014";
const rules = fs.readFileSync(new URL("../firebase/firestore.rules", import.meta.url), "utf8");
const env = await initializeTestEnvironment({
  projectId,
  firestore: {rules, host: "127.0.0.1", port: 8080},
});

try {
  const userA = env.authenticatedContext("user-a").firestore();
  const userB = env.authenticatedContext("user-b").firestore();
  const admin = env.authenticatedContext("admin-user", {sedesAdmin: true}).firestore();

  const stateA = doc(userA, "users/user-a/apps/sedes-df-questoes/profiles/rodrigo/state/session");
  await assertSucceeds(setDoc(stateA, {key: "session", value: "{}"}));
  await assertSucceeds(getDoc(stateA));

  const crossRead = doc(userB, "users/user-a/apps/sedes-df-questoes/profiles/rodrigo/state/session");
  await assertFails(getDoc(crossRead));
  await assertFails(setDoc(crossRead, {key: "session", value: "intruso"}));

  const reportA = doc(userA, "users/user-a/apps/sedes-df-questoes/reportQueue/report-1");
  await assertSucceeds(setDoc(reportA, {ownerUid: "user-a", platform: "sedes-df-questoes", status: "novo"}));
  await assertFails(getDoc(doc(userB, "users/user-a/apps/sedes-df-questoes/reportQueue/report-1")));
  await assertSucceeds(getDoc(doc(admin, "users/user-a/apps/sedes-df-questoes/reportQueue/report-1")));

  const outside = doc(userA, "public/unsafe");
  await assertFails(setDoc(outside, {open: true}));

  console.log("✓ Firestore Rules: proprietário permitido, UID cruzado negado, fila administrativa protegida e caminhos externos fechados.");
} finally {
  await env.cleanup();
}
