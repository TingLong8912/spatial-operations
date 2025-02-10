import { Router } from 'express';

const router = Router();

// Determines the quadrant of a point
// (used in compare function)
function quad(p) {
    if (p[0] >= 0 && p[1] >= 0) {
        return 1;
    }
    if (p[0] <= 0 && p[1] >= 0) {
        return 2;
    }
    if (p[0] <= 0 && p[1] <= 0) {
        return 3;
    }
    return 4;
}

// Checks whether the line is crossing the polygon
function orientation(a, b, c) {
    const res = (b[1] - a[1]) * (c[0] - b[0]) - (c[1] - b[1]) * (b[0] - a[0]);
    if (res === 0) {
        return 0; // collinear
    }
    return (res > 0) ? 1 : -1;
}

// Compare function for sorting points
function compare(p1, q1, mid) {
    const p = [p1[0] - mid[0], p1[1] - mid[1]];
    const q = [q1[0] - mid[0], q1[1] - mid[1]];
    const one = quad(p);
    const two = quad(q);

    if (one !== two) {
        return (one < two) ? -1 : 1;
    }

    return (p[1] * q[0] < q[1] * p[0]) ? -1 : 1;
}

// Finds the upper tangent of two polygons 'a' and 'b'
function findUpperTangent(a, b) {
    let mid = [0, 0];
    const n1 = a.length;
    const n2 = b.length;

    // Find the centroid for a
    let maxa = -Infinity;
    for (let i = 0; i < n1; i++) {
        maxa = Math.max(maxa, a[i][0]);
        mid[0] += a[i][0];
        mid[1] += a[i][1];
        a[i][0] *= n1;
        a[i][1] *= n1;
    }

    a.sort((p1, p2) => compare(p1, p2, mid));
    for (let i = 0; i < n1; i++) {
        a[i][0] /= n1;
        a[i][1] /= n1;
    }

    mid = [0, 0];
    let minb = Infinity;
    for (let i = 0; i < n2; i++) {
        minb = Math.min(minb, b[i][0]);
        mid[0] += b[i][0];
        mid[1] += b[i][1];
        b[i][0] *= n2;
        b[i][1] *= n2;
    }

    b.sort((p1, p2) => compare(p1, p2, mid));
    for (let i = 0; i < n2; i++) {
        b[i][0] /= n2;
        b[i][1] /= n2;
    }

    if (minb < maxa) {
        [a, b] = [b, a];
    }

    let ia = 0, ib = 0;
    for (let i = 1; i < n1; i++) {
        if (a[i][0] > a[ia][0]) {
            ia = i;
        }
    }

    for (let i = 1; i < n2; i++) {
        if (b[i][0] < b[ib][0]) {
            ib = i;
        }
    }

    let inda = ia;
    let indb = ib;
    let done = false;
    while (!done) {
        done = true;
        while (orientation(b[indb], a[inda], a[(inda + 1) % n1]) >= 0) {
            inda = (inda + 1) % n1;
        }

        while (orientation(a[inda], b[indb], b[(n2 + indb - 1) % n2]) <= 0) {
            indb = (n2 + indb - 1) % n2;
            done = false;
        }
    }

    return [a[inda], b[indb]];
}

// Finds the lower tangent of two polygons 'a' and 'b'
function findLowerTangent(a, b) {
    let mid = [0, 0];
    const n1 = a.length;
    const n2 = b.length;

    // Find the centroid for a
    let maxa = -Infinity;
    for (let i = 0; i < n1; i++) {
        maxa = Math.max(maxa, a[i][0]);
        mid[0] += a[i][0];
        mid[1] += a[i][1];
        a[i][0] *= n1;
        a[i][1] *= n1;
    }

    a.sort((p1, p2) => compare(p1, p2, mid));
    for (let i = 0; i < n1; i++) {
        a[i][0] /= n1;
        a[i][1] /= n1;
    }

    mid = [0, 0];
    let minb = Infinity;
    for (let i = 0; i < n2; i++) {
        minb = Math.min(minb, b[i][0]);
        mid[0] += b[i][0];
        mid[1] += b[i][1];
        b[i][0] *= n2;
        b[i][1] *= n2;
    }

    b.sort((p1, p2) => compare(p1, p2, mid));
    for (let i = 0; i < n2; i++) {
        b[i][0] /= n2;
        b[i][1] /= n2;
    }

    if (minb < maxa) {
        [a, b] = [b, a];
    }

    let ia = 0, ib = 0;
    for (let i = 1; i < n1; i++) {
        if (a[i][0] > a[ia][0]) {
            ia = i;
        }
    }

    for (let i = 1; i < n2; i++) {
        if (b[i][0] < b[ib][0]) {
            ib = i;
        }
    }

    let inda = ia;
    let indb = ib;
    let done = false;
    while (!done) {
        done = true;
        while (orientation(b[indb], a[inda], a[(inda + 1) % n1]) <= 0) {
            inda = (inda + 1) % n1;
        }

        while (orientation(a[inda], b[indb], b[(n2 + indb - 1) % n2]) >= 0) {
            indb = (n2 + indb - 1) % n2;
            done = false;
        }
    }

    return [a[inda], b[indb]];
}

// API route for tangent
router.post('/tangent', (req, res) => {
    const { a, b } = req.body;
    console.log(a, b);
    
    if (!a || !b) {
        return res.status(400).json({ error: 'Both polygons must be provided' });
    }

    const upper = findUpperTangent(a, b);
    const lower = findLowerTangent(a, b);
    return res.json({ upperTangent: upper, lowerTangent: lower });
});

router.get('/test', (req, res) => {
    return res.json({"message": "success"});
});

export default router;
