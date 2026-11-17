import express from 'express';
import axios from 'axios';
import config from './config.js'

// TP1 - Servicio de cambio de monedas
import {
    init as exchangeInit,
    getAccounts,
    setAccountBalance,
    getRates,
    setRate,
    getLog,
    exchange,
} from './exchange.js';

await exchangeInit();

const app = express();

app.get('/', (req, res) => {
    res.status(200).send('Server is up.')
});

// TP1 - Endpoints de arVault
app.use(express.json());

app.get('/accounts', (req, res) => {
    res.json(getAccounts());
});

app.put('/accounts/:id/balance', (req, res) => {
    const accountId = req.params.id;
    const { balance } = req.body;

    if (!accountId || !balance) {
        return res.status(400).json({ error: 'Malformed request' });
    } else {
        setAccountBalance(accountId, balance);
        res.json(getAccounts());
    }
});

app.get('/rates', (req, res) => {
    res.json(getRates());
});

app.put('/rates', (req, res) => {
    const { baseCurrency, counterCurrency, rate } = req.body;

    if (!baseCurrency || !counterCurrency || !rate) {
        return res.status(400).json({ error: 'Malformed request' });
    }

    const newRateRequest = { ...req.body };
    setRate(newRateRequest);
    res.json(getRates());
});

app.get('/log', (req, res) => {
    res.json(getLog());
});

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

    const exchangeRequest = { ...req.body };
    const exchangeResult = await exchange(exchangeRequest);

    if (exchangeResult.ok) {
        res.status(200).json(exchangeResult);
    } else {
        res.status(500).json(exchangeResult);
    }
});

app.get('/:dni', async (req, res) => {
    try {
        const response = await axios.post(`${config.arcaUri}/validar`, {dni: parseInt(req.params.dni)});
        if (response.status == 200) {
            res.status(200).send(response.data);
        } else {
            res.status(500).send(`Unexpected return code ${response.status} from ARCA`);
        }
    } catch (e) {
        console.error("Exception consuming ARCA's service", e);
        res.status(500).send("Exception consuming ARCA's service");
    }
})

app.listen(3000, () => console.log("Listening on port 3000"));