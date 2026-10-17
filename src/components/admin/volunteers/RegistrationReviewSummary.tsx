import type { VolunteerRegistrationDetail } from "../../../lib/volunteers/types";
import { volunteerRegistrationStatusLabel } from "../../../lib/volunteers/labels";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { registrationReviewCopy } from "./registrationReviewCopy";
import { volunteerFormatCopy } from "./volunteerFormatCopy";

export function RegistrationReviewSummary({
  registration,
}: {
  registration: VolunteerRegistrationDetail;
}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(registrationReviewCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const review = registration.review;
  return (
    <section
      aria-label={copy.heading}
      className="mt-5 space-y-2 rounded-lg border border-[var(--color-border)] p-4 text-sm"
    >
      <h2 className="font-bold">{copy.heading}</h2>
      <p>
        {copy.status}: {volunteerRegistrationStatusLabel(registration.status, language)}
      </p>
      {registration.statusReason && (
        <p>
          {copy.storedReason}: {registration.statusReason}
        </p>
      )}
      <p>
        {copy.capacity(
          registration.activity.approvedParticipants,
          registration.activity.capacity,
          registration.activity.waitlistedParticipants,
        )}
      </p>
      <p>{copy.snapshot}</p>
      {review?.state === "evaluated" ? (
        <>
          <p>
            {copy.evaluation}: {copy.reason(review.reason)}
          </p>
          {review.capacity && (
            <p>
              {copy.effectiveCapacity(
                review.capacity.capacity,
                review.capacity.confirmed,
                review.capacity.remaining,
              )}
            </p>
          )}
          {review.requirements ? (
            <ul className="list-inside list-disc">
              <li>{copy.age(review.requirements.minAge)}</li>
              <li>
                {copy.tiers}:{" "}
                {review.requirements.allowedTiers.map((tier) => copy.tier[tier]).join(" / ")}
              </li>
              {review.requirements.roleKey && (
                <li>
                  {copy.role(review.requirements.roleKey)}
                  {review.requirements.role ? (
                    <>
                      <p>
                        {copy.roleTiers}:{" "}
                        {review.requirements.role.allowedTiers
                          .map((tier) => copy.tier[tier])
                          .join(" / ")}
                      </p>
                      <p>
                        {copy.roleCredentials(
                          review.requirements.role.credentials.mode,
                          review.requirements.role.credentials.keys,
                        )}
                      </p>
                    </>
                  ) : (
                    <p>{copy.roleUnavailable}</p>
                  )}
                </li>
              )}
              <li>
                {copy.credentials(
                  review.requirements.credentials.mode,
                  review.requirements.credentials.keys,
                )}
              </li>
            </ul>
          ) : (
            <p>{copy.conditionsUnavailable}</p>
          )}
        </>
      ) : (
        <p role="status">{copy.unavailable}</p>
      )}
      {review && <p>{copy.asOf(format.sessionTime(review.asOf))}</p>}
    </section>
  );
}
