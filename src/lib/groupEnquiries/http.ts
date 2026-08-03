export const GROUP_ENQUIRY_SUCCESS_STATUS = 202;

export function groupEnquirySuccessBody(enquiryId: string) {
  return { ok: true, enquiryId };
}
