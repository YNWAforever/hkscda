import {createRoot} from "react-dom/client";
import {useState} from "react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {SponsorshipFollowupBulkPanel} from "../../src/components/admin/sponsorship/SponsorshipFollowupBulkPanel";
import "../../src/styles.css";
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Fixture(){const [count,setCount]=useState(25);return <main className="p-4"><h1>合成批量跟進驗收</h1><button onClick={()=>setCount(1000)}>選取 1000 筆</button><SponsorshipFollowupBulkPanel selectedIds={Array.from({length:count},(_,i)=>`11111111-1111-4111-8111-${String(i+1).padStart(12,"0")}`)} filterKey="synthetic" selectionDisabled={false} onApplied={()=>{}} /></main>;}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><Fixture/></QueryClientProvider>);
