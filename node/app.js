import express from 'express';
import { ArcaError, isValidDni, validateDni } from './arca.js';
import { nanoid } from 'nanoid';

// Redis - operaciones compartidas
import {
    setRedisBalance,
    setRedisRate,
    addRedisLogEntry
} from './redisUpdates.js';

// TP1 - Servicio de cambio de monedas
import {
    init as exchangeInit,
    getAccounts,
    setAccountBalance,
    getRates,
    setRate,
    getLog,
    exchange,
    getSharedState,
} from './exchange.js';

await exchangeInit();

const app = express();

app.get('/', (req, res) => {
    res.status(200).send('Server is up.')
});

// TP1 - Endpoints de arVault
app.use(express.json());

app.get('/accounts', async (req, res) => {
    try {
        res.json(await getSharedState('accounts', getAccounts()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/accounts/:id/balance', async (req, res) => {
    const accountId = req.params.id;
    const { balance } = req.body;

    if (!accountId || balance === undefined || balance === null) {
        return res.status(400).json({ error: 'Malformed request' });
    }

    try {
        if (process.env.REDIS_ENABLED === 'true') {
            res.json(await setRedisBalance(accountId, balance));
        } else {
            setAccountBalance(accountId, balance);
            res.json(getAccounts());
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// app.put('/accounts/:id/balance', (req, res) => {
//     const accountId = req.params.id;
//     const { balance } = req.body;

//     if (!accountId || !balance) {
//         return res.status(400).json({ error: 'Malformed request' });
//     } else {
//         setAccountBalance(accountId, balance);
//         res.json(getAccounts());
//     }
// });

app.get('/rates', async (req, res) => {
    try {
        res.json(await getSharedState('rates', getRates()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/rates', async (req, res) => {
    const { baseCurrency, counterCurrency, rate } = req.body;

    if (!baseCurrency || !counterCurrency || !rate) {
        return res.status(400).json({ error: 'Malformed request' });
    }

    try {
        if (process.env.REDIS_ENABLED === 'true') {
            res.json(await setRedisRate(req.body));
        } else {
            setRate(req.body);
            res.json(getRates());
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// app.put('/rates', (req, res) => {
//     const { baseCurrency, counterCurrency, rate } = req.body;

//     if (!baseCurrency || !counterCurrency || !rate) {
//         return res.status(400).json({ error: 'Malformed request' });
//     }

//     const newRateRequest = { ...req.body };
//     setRate(newRateRequest);
//     res.json(getRates());
// });

app.get('/log', async (req, res) => {
    try {
        res.json(await getSharedState('log', getLog()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



async function respondWithLoggedOperation(res, status, operation) {
    try {
        if (process.env.REDIS_ENABLED === 'true') {
            await addRedisLogEntry(operation);
        } else {
            getLog().push(operation);
        }
    } catch (error) {
        console.error('Could not record operation:', error.message);
        return res.status(503).json({
            ...operation,
            error: 'OPERATION_LOG_UNAVAILABLE',
            logRecorded: false,
        });
    }

    return res.status(status).json({ ...operation, logRecorded: true });
}

app.post('/exchange', async (req, res) => {
    const {
        baseCurrency,
        counterCurrency,
        baseAccountId,
        counterAccountId,
        baseAmount,
    } = req.body;

    if (
        !baseCurrency ||
        !counterCurrency ||
        !baseAccountId ||
        !counterAccountId ||
        !baseAmount
    ) {
        return res.status(400).json({ error: 'Malformed request' });
    }

    if (!isValidDni(req.body.dni)) {
        return res.status(400).json({
            ok: false,
            error: 'El DNI debe ser un texto entre 1000000 y 99999999',
        });
    }

    try {
        // Primero validamos el DNI con ARCA
        const arcaResult = await validateDni(req.body.dni);

        if (!arcaResult.ok) {
            const rejectedOperation = {
                id: nanoid(),
                ts: new Date(),
                ok: false,
                request: req.body,
                dni: arcaResult.dni,
                arca: arcaResult,
                counterAmount: 0,
                obs: 'ARCA rejected the operation',
            };

            return respondWithLoggedOperation(res, 403, rejectedOperation);
        }

        // Si ARCA aprueba, ejecutamos el intercambio
        const exchangeRequest = {
            ...req.body,
            dni: arcaResult.dni,
            arca: {
                ok: arcaResult.ok,
                codigoAutorizacion: arcaResult.codigoAutorizacion,
            },
        };

        const exchangeResult = await exchange(exchangeRequest);

        if (exchangeResult.ok) {
            return res.status(200).json(exchangeResult);
        }

        return res.status(500).json(exchangeResult);

    } catch (err) {
        console.error('Error processing exchange:', err.message);

        if (err instanceof ArcaError) {
            const failedOperation = {
                id: nanoid(),
                ts: new Date(),
                ok: false,
                request: req.body,
                dni: req.body.dni,
                arca: {
                    ok: null,
                    error: { type: err.reason, upstreamStatus: err.upstreamStatus },
                },
                counterAmount: 0,
                obs: err.message,
                error: err.code,
            };
            return respondWithLoggedOperation(res, err.httpStatus, failedOperation);
        }

        return res.status(500).json({
            ok: false,
            error: 'Could not process exchange',
        });
    }
});




app.get('/:dni', async (req, res) => {
    if (!isValidDni(req.params.dni)) {
        return res.status(400).json({
            ok: false,
            error: 'El DNI debe ser un texto entre 1000000 y 99999999',
        });
    }

    try {
        res.status(200).json(await validateDni(req.params.dni));
    } catch (e) {
        console.error("Exception consuming ARCA's service:", e.message);
        res.status(e instanceof ArcaError ? e.httpStatus : 500).json({
            ok: false,
            error: e instanceof ArcaError ? e.code : 'ARCA_VALIDATION_FAILED',
            reason: e instanceof ArcaError ? e.reason : undefined,
        });
    }
})

// TP2 - permito ejecutar varias instancias localmente
// app.listen(3000, () => console.log("Listening on port 3000"));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`Listening on port ${PORT}`))