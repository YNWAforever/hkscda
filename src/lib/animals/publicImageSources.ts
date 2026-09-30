/** Public Storage transformations are opt-in because they require an enabled paid plan. */
export function publicAnimalImageSources(
  source: string,
  projectOrigin: string | undefined,
  enabled: boolean,
): { srcSet: string; sizes: string } | null {
  if (!enabled || !projectOrigin) return null;
  try {
    const origin = new URL(projectOrigin);
    const image = new URL(source);
    if (
      origin.protocol !== "https:" ||
      image.protocol !== "https:" ||
      image.origin !== origin.origin ||
      !image.pathname.startsWith("/storage/v1/object/public/animal-images/") ||
      image.search ||
      image.hash
    )
      return null;
    image.pathname = image.pathname.replace(
      "/storage/v1/object/public/",
      "/storage/v1/render/image/public/",
    );
    const srcSet = [360, 720, 1080]
      .map((width) => {
        const variant = new URL(image);
        variant.searchParams.set("width", String(width));
        variant.searchParams.set("height", String(Math.round(width * 0.75)));
        variant.searchParams.set("resize", "cover");
        variant.searchParams.set("quality", "75");
        return variant.toString() + " " + width + "w";
      })
      .join(", ");
    return {
      srcSet,
      sizes: "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
    };
  } catch {
    return null;
  }
}
