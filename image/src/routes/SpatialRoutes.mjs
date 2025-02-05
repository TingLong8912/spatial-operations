import { Router } from 'express';

const router = Router();

router.get('/hello', (req, res) => {
    res.json({
        "status": "success",
        "message": "Hello, spatial"
    });
});

export default router;
