const SUPPORTERS_LIST_PATH = "/admin/supporters";

export function isSupportersListPath(pathname: string) {
  return pathname === SUPPORTERS_LIST_PATH || pathname === `${SUPPORTERS_LIST_PATH}/`;
}
