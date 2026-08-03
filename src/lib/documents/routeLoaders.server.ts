type ContextFreeLoader<Result> = () => Promise<Result>;

export function asContextFreeRouteLoader<Result>(
  loader: ContextFreeLoader<Result>,
): ContextFreeLoader<Result> {
  return () => loader();
}
