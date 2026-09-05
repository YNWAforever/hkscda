import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TurnstileWidget } from "../../src/components/site/TurnstileWidget";
function Fixture() {
  const [token, setToken] = useState("");
  const [language, setLanguage] = useState("en");
  const [visible, setVisible] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  return (
    <>
      <output data-token>{token}</output>
      <button onClick={() => setLanguage((x) => (x === "en" ? "zh-HK" : "en"))}>language</button>
      <button onClick={() => setVisible((x) => !x)}>toggle</button>
      <button onClick={() => setResetKey((x) => x + 1)}>reset</button>
      {visible && (
        <TurnstileWidget
          language={language}
          resetKey={resetKey}
          onVerify={setToken}
          onExpire={() => setToken("")}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
