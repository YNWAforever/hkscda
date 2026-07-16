type FixedActionLayoutInput = {
  shortlistHeight: number;
  donationHeight: number;
};

export function calculateFixedActionLayout({
  shortlistHeight,
  donationHeight,
}: FixedActionLayoutInput) {
  const shortlistGap = shortlistHeight > 0 ? 12 : 0;
  const donationGap = donationHeight > 0 ? 12 : 0;
  const donationBottom = shortlistHeight > 0 ? 16 + shortlistHeight + shortlistGap : 16;
  const stackedHeight = shortlistHeight + donationHeight + shortlistGap + donationGap;
  const contentBottom = stackedHeight > 0 ? stackedHeight + 4 : 0;
  const helpBottom = stackedHeight > 0 ? 16 + stackedHeight : 16;

  return { donationBottom, helpBottom, contentBottom };
}
