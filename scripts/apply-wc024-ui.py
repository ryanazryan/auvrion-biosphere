"""Idempotent, guarded WC024 UI bridge. Run from repository root."""
from pathlib import Path

p = Path("src/figma-operator/demo/OperatorAssistant.tsx")
original = p.read_text(encoding="utf-8")
if 'WC-024: Auvrion Luna environmental service' in original:
    raise SystemExit('WC024 UI bridge already applied; refusing replay')
changes = []

def replace_once(old: str, new: str):
    global original
    if original.count(old) != 1:
        raise SystemExit(f'ABORT: Expected exactly one matching section, got {original.count(old)}: {old[:100]!r}. No writes performed.')
    original = original.replace(old, new)
    changes.append(old[:48])

replace_once('import * as I from "@/figma-operator/components/icons";',
'''import * as I from "@/figma-operator/components/icons";
import { useOperator } from "@/figma-operator/operator-context";''')
replace_once('export function OperatorAssistControls() {\n  const path = usePathname();',
'''export function OperatorAssistControls() {
  const { operator: OPERATOR } = useOperator();
  const path = usePathname();''')
replace_once('''      facts?: OpenDetail["facts"];
    }[]
  >([]);''', '''      facts?: OpenDetail["facts"];
      answer?: string;
      state?: "loading" | "ready" | "error";
      sources?: { name: string; url: string }[];
    }[]
  >([]);''')
replace_once('''      if (value?.autoPrompt) {
        setMessages((prev) => [
          ...prev,
          {
            id: prev.length + 1,
            query: value.autoPrompt ?? "",
            context: value.context,
            facts: value.facts,
          },
        ]);
      }''', '''      if (value?.autoPrompt) {
        askQuestion(value.autoPrompt, value.context, value.facts);
      }''')
replace_once('''    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);''', '''    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, [OPERATOR.organizationId]);''')
old = '''  function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setMessages((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        query: value,
        context: detail.context,
        facts: detail.facts,
      },
    ]);
    setQuery("");
  }
  function suggested(label: string, context: AIContext) {
    setDetail((old) => ({ ...old, context }));
    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, query: label, context, facts: detail.facts },
    ]);
  }'''
new = '''  // WC-024: Auvrion Luna environmental service. Other contexts remain honest preview states.
  function askQuestion(value: string, context: AIContext, facts?: OpenDetail["facts"]) {
    const id = Date.now() + Math.random();
    setMessages((prev) => [
      ...prev,
      { id, query: value, context, facts, state: context === "environment" ? "loading" : undefined },
    ]);
    if (context !== "environment") return;
    void (async () => {
      try {
        const response = await fetch(
          `/api/operator/environment/analyze?organizationId=${encodeURIComponent(OPERATOR.organizationId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: value }),
          },
        );
        if (!response.ok) throw new Error("ANALYSIS_NOT_AVAILABLE");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" ||
          !("answer" in data) || typeof data.answer !== "string")
          throw new Error("INVALID_ANSWER");
        const answer = data.answer;
        const sources = "sources" in data && Array.isArray(data.sources)
          ? (data.sources as { name: string; url: string }[]).filter(
              (s) => s && typeof s.name === "string" && typeof s.url === "string" &&
                (s.url === "https://data.bmkg.go.id/prakiraan-cuaca/" ||
                 s.url === "https://firms.modaps.eosdis.nasa.gov/api/area"),
            ) : [];
        setMessages((prev) => prev.map((m) => m.id === id
          ? { ...m, answer, state: "ready", sources } : m));
      } catch {
        setMessages((prev) => prev.map((m) => m.id === id
          ? { ...m, state: "error" } : m));
      }
    })();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    askQuestion(value, detail.context, detail.facts);
    setQuery("");
  }
  function suggested(label: string, context: AIContext) {
    setDetail((old) => ({ ...old, context }));
    askQuestion(label, context, detail.facts);
  }'''
replace_once(old, new)
replace_once('''                        <p className="mb-2 font-semibold">
                          {msg.context === "listen" && isListenReady
                            ? "Pola suara perlu ditinjau"
                            : "Analisis belum tersedia"}
                        </p>''', '''                        <p className="mb-2 font-semibold">
                          {msg.state === "loading"
                            ? "Mengambil konteks BMKG dan NASA FIRMS…"
                            : msg.state === "ready"
                              ? "Analisis GPT-6 Luna · advisory"
                              : msg.state === "error"
                                ? "Analisis belum tersedia"
                                : msg.context === "listen" && isListenReady
                                  ? "Pola suara perlu ditinjau"
                                  : "Analisis belum tersedia"}
                        </p>''')
replace_once('''                        {msg.facts && msg.facts.length > 0 ? (''', '''                        {msg.answer ? (
                          <p className="whitespace-pre-wrap break-words">{msg.answer}</p>
                        ) : msg.state === "loading" ? (
                          <p className="text-muted">Meminta ringkasan data resmi yang tersedia…</p>
                        ) : msg.state === "error" ? (
                          <p className="text-muted">Data atau layanan AI belum tersedia. Coba lagi setelah konfigurasi sumber dan API key diperiksa.</p>
                        ) : msg.facts && msg.facts.length > 0 ? (''')
replace_once('''                        <p className="mt-2 text-xs text-muted">
                          {msg.context === "environment"''', '''                        {msg.sources && msg.sources.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            {msg.sources.map((source) => (
                              <li key={source.url}>
                                <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline">
                                  {source.name}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 text-xs text-muted">
                          {msg.context === "environment"''')
replace_once('''              AI belum terhubung. Skenario LISTEN adalah data simulasi, bukan
              model analisis produksi.''','''              Analisis lingkungan memakai data resmi BMKG/NASA FIRMS bila tersedia.
              Konteks LISTEN lain masih preview; keputusan manusia tetap wajib.''')
p.write_text(original, encoding="utf-8")
print(f'WC024 UI bridge applied: {len(changes)} verified replacements')
