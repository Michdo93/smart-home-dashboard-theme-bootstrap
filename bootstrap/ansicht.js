/**
 * ansicht.js – das Smart-Home-Dashboard mit Bootstrap 5.
 *
 * Nur die Ansicht ist neu. Controller, Store, Formate und Texte kommen aus
 * dem installierten Dashboard (../js/), deshalb liegt dieser Ordner als
 * Unterordner im Dashboard: …/dashboard/bootstrap/
 */
import { createController } from "../js/controller.js";
import { baseType, isControl } from "../js/widgets.js";
import { formatState, numberOf } from "../js/format.js";
import { locale, setLanguage, t } from "../js/i18n.js";

const config = window.DASHBOARD_CONFIG;
const params = new URLSearchParams(location.search);
const $ = (selector) => document.querySelector(selector);

// ─── Hell oder dunkel: Bootstrap 5.3 liest data-bs-theme ────────────────────
const dunkel = matchMedia("(prefers-color-scheme: dark)");
const modus = () => (document.documentElement.dataset.bsTheme =
  dunkel.matches ? "dark" : "light");
modus();
dunkel.addEventListener("change", modus);

setLanguage(params.get("lang") ?? config.language ?? "de");
document.title = `${config.title} · Bootstrap`;
$("#titel").textContent = config.title;

const controller = createController(config, {
  onStatus: (zustand, text) => {
    $("#status").className = "rounded-circle "
      + (zustand === "online" ? "bg-success" : "bg-danger");
    $("#status").title = text;
    $("#status").setAttribute("aria-label", text);
  },
  onError: (text) => {
    const box = $("#hinweis");
    box.textContent = text;
    box.hidden = false;
    clearTimeout(box.timer);
    box.timer = setTimeout(() => (box.hidden = true), 4000);
  }
});
const { store, send } = controller;

// ─── Bausteine ───────────────────────────────────────────────────────────────

/** Element mit Klassen und Kindern, Texte immer als Text */
function el(tag, klassen = "", ...kinder) {
  const node = document.createElement(tag);
  if (klassen) node.className = klassen;
  node.append(...kinder);
  return node;
}

/** Symbol als Schriftzeichen, nicht als buntes Emoji (Variation Selector 15) */
const TEXT = (zeichen) => `${zeichen}︎`;

function knopf(text, beschriftung, onclick, art = "btn-outline-secondary") {
  const b = el("button", `btn ${art}`, text);
  b.setAttribute("aria-label", beschriftung);
  b.addEventListener("click", onclick);
  return b;
}

function gruppe(...knoepfe) {
  const g = el("div", "btn-group", ...knoepfe);
  g.setAttribute("role", "group");
  return g;
}

// ─── Ein Bedienelement je Item-Typ ───────────────────────────────────────────

function schalter(item) {
  const input = el("input", "form-check-input");
  Object.assign(input, { type: "checkbox", role: "switch" });
  input.setAttribute("aria-label", item.label);
  input.addEventListener("click", (event) => {
    event.preventDefault();               // erst umschalten, wenn openHAB es meldet
    send(item.name, input.checked ? "ON" : "OFF");
  });
  store.subscribe(item.name, (i) => (input.checked = i.state === "ON"
    || (baseType(i) === "Color" && numberOf(i.state.split(",")[2]) > 0)));
  return el("div", "form-check form-switch m-0", input);
}

function regler(item) {
  const input = el("input", "form-range");
  Object.assign(input, { type: "range", min: 0, max: 100 });
  input.setAttribute("aria-label", item.label);
  const zahl = el("span", "zahl text-end");
  input.addEventListener("input", () => (zahl.textContent = `${input.value} %`));
  input.addEventListener("change", () => send(item.name, input.value));
  store.subscribe(item.name, (i) => {
    if (document.activeElement !== input) input.value = numberOf(i.state) ?? 0;
    zahl.textContent = formatState(i);
  });
  return el("div", "d-flex align-items-center gap-2 flex-grow-1", input, zahl);
}

function sollwert(item) {
  const { minimum, maximum, step = 1 } = item.stateDescription;
  const einheit = item.unitSymbol ? ` ${item.unitSymbol}` : "";
  const wert = el("span", "btn btn-outline-secondary pe-none");
  const aendern = (richtung) => {
    const jetzt = numberOf(store.get(item.name).state) ?? minimum;
    const neu = Math.min(maximum, Math.max(minimum, jetzt + richtung * step));
    send(item.name, `${Number(neu.toFixed(3))}${einheit}`);
  };
  store.subscribe(item.name, (i) => (wert.textContent = formatState(i)));
  return gruppe(knopf("−", t("less"), () => aendern(-1)), wert,
    knopf("+", t("more"), () => aendern(1)));
}

function auswahl(item, optionen) {
  if (optionen.length === 1) {
    const [o] = optionen;
    return knopf(o.label || o.command, item.label, () => send(item.name, o.command),
      "btn-primary");
  }
  const select = el("select", "form-select w-auto",
    ...optionen.map((o) => new Option(o.label || o.command, o.command)));
  select.setAttribute("aria-label", item.label);
  select.addEventListener("change", () => send(item.name, select.value));
  store.subscribe(item.name, (i) => (select.value = i.state));
  return select;
}

/** HSB (openHAB) ↔ #rrggbb (Farbwähler des Browsers) */
function hsbZuHex(state) {
  const [h, s, v] = String(state).split(",").map(Number);
  const f = (n) => {
    const k = (n + h / 60) % 6;
    const x = (v / 100) * (1 - (s / 100) * Math.max(0, Math.min(k, 4 - k, 1)));
    return Math.round(x * 255).toString(16).padStart(2, "0");
  };
  return Number.isNaN(v) ? "#ffffff" : `#${f(5)}${f(3)}${f(1)}`;
}

function hexZuHsb(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h;
  if (d === 0) h = 0;
  else if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  const hsb = [(h * 60 + 360) % 360, max ? (d / max) * 100 : 0, max * 100];
  return hsb.map(Math.round).join(",");
}

function farbe(item) {
  const input = el("input", "form-control form-control-color");
  input.type = "color";
  input.setAttribute("aria-label", item.label);
  input.addEventListener("change", () => send(item.name, hexZuHsb(input.value)));
  store.subscribe(item.name, (i) => (input.value = hsbZuHex(i.state)));
  return el("div", "d-flex gap-2 align-items-center", input, schalter(item));
}

function bedienelement(item) {
  const optionen = item.commandDescription?.commandOptions ?? [];
  if (optionen.length) return auswahl(item, optionen);
  const senden = (befehl) => () => send(item.name, befehl);
  switch (baseType(item)) {
    case "Switch": return schalter(item);
    case "Dimmer": return regler(item);
    case "Color": return farbe(item);
    case "Rollershutter": return gruppe(knopf("▲", t("up"), senden("UP")),
      knopf("■", t("stop"), senden("STOP")), knopf("▼", t("down"), senden("DOWN")));
    case "Player": return gruppe(
      knopf(TEXT("⏮"), t("previous"), senden("PREVIOUS")),
      knopf(TEXT("⏯"), t("play"), () => send(item.name,
        store.get(item.name).state === "PLAY" ? "PAUSE" : "PLAY")),
      knopf(TEXT("⏭"), t("next"), senden("NEXT")));
    case "Number":
      if (item.stateDescription?.minimum !== undefined) return sollwert(item);
  }
  return anzeige(item);
}

function anzeige(item) {
  const wert = el("span", "text-body-secondary text-end");
  store.subscribe(item.name, (i) => (wert.textContent = formatState(i)));
  return wert;
}

// ─── Seiten: Übersicht und Räume ─────────────────────────────────────────────

const ZEILE = "list-group-item d-flex flex-wrap justify-content-between"
  + " align-items-center gap-2";

function karte({ group, points }) {
  const liste = el("ul", "list-group list-group-flush",
    ...points.map((item) => el("li", ZEILE, el("span", "", item.label),
      isControl(item) ? bedienelement(item) : anzeige(item))));
  return el("div", "col-12 col-md-6 col-xl-4",
    el("div", "card h-100 shadow-sm",
      el("div", "card-header fw-semibold", group.label), liste));
}

/** Übersicht: Kacheln aus config.overview, bei Gruppen "3 von 7" */
function uebersicht() {
  return (config.overview ?? []).map((name) => store.get(name)).filter(Boolean)
    .map((item) => {
      const wert = el("div", "fs-3 fw-semibold");
      if (["Switch", "Contact"].includes(item.groupType)) {
        const mitglieder = store.members(item.name);
        const zaehlen = () => {
          const aktiv = mitglieder.filter((m) => ["ON", "OPEN"].includes(m.state));
          wert.textContent = `${aktiv.length} ${t("of")} ${mitglieder.length}`;
        };
        for (const m of mitglieder) store.subscribe(m.name, zaehlen);
      } else {
        store.subscribe(item.name, (i) => (wert.textContent = formatState(i)));
      }
      return el("div", "col-6 col-md-4 col-xl-2",
        el("div", "card h-100 text-center",
          el("div", "card-body", wert,
            el("div", "text-body-secondary", item.label))));
    });
}

function seiten() {
  const liste = [{ name: "overview", label: t("overview") }, ...controller.rooms()];
  let aktuell = params.get("room") ?? "overview";
  const reiter = liste.map((seite) => {
    const link = el("button", "nav-link", seite.label);
    link.setAttribute("role", "tab");
    link.addEventListener("click", () => zeigen(seite));
    return el("li", "nav-item", link);
  });
  $("#raeume").replaceChildren(...reiter);

  function zeigen(seite) {
    aktuell = seite.name;
    store.newView();                      // Beobachter der alten Seite abmelden
    reiter.forEach((li, i) => {
      li.firstChild.classList.toggle("active", liste[i] === seite);
      li.firstChild.setAttribute("aria-selected", liste[i] === seite);
    });
    $("#inhalt").replaceChildren(...(seite.name === "overview"
      ? uebersicht() : controller.devices(seite).map(karte)));
  }
  zeigen(liste.find((seite) => seite.name === aktuell) ?? liste[0]);
}

function uhr() {
  const node = $("#uhr");
  const tick = () => (node.textContent = new Date().toLocaleTimeString(locale(),
    { hour: "2-digit", minute: "2-digit" }));
  tick();
  setInterval(tick, 10000);
}

uhr();
$("#inhalt").textContent = t("loading");
if (await controller.connect()) {
  seiten();
  controller.watch();
} else {
  $("#inhalt").textContent = t("unreachable");
}
