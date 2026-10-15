"""Bounded offline contour interpolation; never used by the game runtime."""
import math


def _curve(a, b, previous, following, count, limit):
    # Tangents share directions at authored anchors. Limit their reach so a
    # long segment cannot pull a neighboring cove or narrow neck out of shape.
    def control(origin, left, right, sign):
        dx, dy = right[0] - left[0], right[1] - left[1]
        length = math.hypot(dx, dy)
        reach = min(length / 6, limit)
        return (origin[0] + sign * dx * reach / (length or 1),
                origin[1] + sign * dy * reach / (length or 1))

    c = control(a, previous, b, 1)
    d = control(b, a, following, -1)
    if count is None:
        return _flatten(a, c, d, b)
    points = []
    for i in range(count):
        t = i / count
        u = 1 - t
        points.append(tuple(u ** 3 * a[k] + 3 * u * u * t * c[k]
                            + 3 * u * t * t * d[k] + t ** 3 * b[k]
                            for k in (0, 1)))
    return points


def _flatten(a, b, c, d, *, tolerance=1, depth=0):
    """De Casteljau subdivision bounds error against the complete chord."""
    dx, dy = d[0] - a[0], d[1] - a[1]
    length_squared = dx * dx + dy * dy

    def error(p):
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy)
                       / (length_squared or 1)))
        return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)

    if max(error(b), error(c)) <= tolerance:
        return [a]
    if depth >= 12:
        raise ValueError("Natural contour cannot satisfy its chord tolerance")
    middle = lambda p, q: ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    ab, bc, cd = middle(a, b), middle(b, c), middle(c, d)
    abc, bcd = middle(ab, bc), middle(bc, cd)
    center = middle(abc, bcd)
    return (_flatten(a, ab, abc, center, tolerance=tolerance, depth=depth + 1)
            + _flatten(center, bcd, cd, d, tolerance=tolerance, depth=depth + 1))


def natural_ring(points, *, reach=45):
    """Return a rounded ring while retaining every authored shoreline anchor."""
    result = []
    for i, a in enumerate(points):
        b = points[(i + 1) % len(points)]
        result.extend(_curve(a, b, points[i - 1], points[(i + 2) % len(points)], None, reach))
    return result


def natural_route(points, *, reach=34):
    """Keep endpoints and authored anchors; gently round ordinary trail bends."""
    result = []
    for i, a in enumerate(points[:-1]):
        b = points[i + 1]
        result.extend(_curve(a, b, points[max(0, i - 1)],
                             points[min(len(points) - 1, i + 2)], 3, reach))
    return [*result, points[-1]]
