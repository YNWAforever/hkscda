import { createRoot } from "react-dom/client";
import { GroupEnquiryForm } from "../../src/components/site/volunteer/GroupEnquiryForm";
import { PledgeWizard } from "../../src/components/site/sponsorship/PledgeWizard";
import { ApplicationWizard } from "../../src/components/site/adoption/ApplicationWizard";
import { VolunteerPage } from "../../src/routes/volunteer";
const form = new URLSearchParams(location.search).get("form");
createRoot(document.getElementById("root")!).render(
  form === "group" ? (
    <GroupEnquiryForm />
  ) : form === "sponsorship" ? (
    <PledgeWizard />
  ) : form === "adoption" ? (
    <ApplicationWizard />
  ) : (
    <VolunteerPage />
  ),
);
