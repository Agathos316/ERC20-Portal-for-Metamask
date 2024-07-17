/**
 *  @title: ERC-20 Transaction Portal for Metamask.
 *  @author: Tim Mapperson
 *  @deployment: https://github.com/Agathos316/
 */


/***************************************************
 * Global variables and constants
 */
// Wallet placeholders.
let accounts;
let tokenBalance;
let ethBalance;
let storedAccountIndex;
// Network placeholders.
let chainId = 0;
let validChain = 0;
let blockNumberOnWalletLoad;
let currentBlockNumber;
// Token placeholders.
let token;
let tokenContract;
let tokenDecimals;
// Tx placeholders.
let pendingTxHash = '';
let pendingNonce = -1;
let pendingGasPriceWei = 0;
let pendingBlockNum = undefined;
let STATE_submittingTx = false;
let STATE_cancellingTx = false;
let STATE_pendingTx = false;
let txSubmissions = 0;
// Subscription and API placeholders.
let subscribe_newBlocks;
let subscribe_pendingTx;
let subscriptions = [0,0];
let etherscanEndpoint;
let etherscanApiKey;
let infuraEndpoint;
let infuraWSS;
let web3_InfuraWS;
let linkUrlPrefix;
// UI placeholders.
let displayBalance = true;
let notificationTimer;
let STATE_awaitingFeeEstimates = true;
let web3;

// Constants.
const $metamaskLogo = document.getElementById('connectButton');
const $metamaskLogoGlow = document.getElementById('connectButtonGlow');
const $metamaskText = document.getElementById('connectText');
const $txDetailsTitle = document.getElementById('txDetailsTitle');
const $txDetails = document.getElementById('txDetails');
const $txLogTitle = document.getElementById('txLogTitle');
const $txLogHeader = document.getElementById('txLogHeader');
const $txLog1 = document.getElementById('txLog1');
const $txLog2 = document.getElementById('txLog2');
const $txLog3 = document.getElementById('txLog3');
const $txLog4 = document.getElementById('txLog4');


/***************************************************
 * @dev Check if dapp is already connected to Metamask wallet.
 */
// Detect which provider to use for metamask. Necessary because 'window.ethereum' is not stable.
// It works sometimes and sometimes does not, in the same browser.
/*if ((window.ethereum).isMetaMask) {
    web3 = new Web3(window.ethereum);
} else if ((window.web3.currentProvider).isMetaMask) {
    web3 = new Web3(window.web3.currentProvider); // For legacy browsers
}*/
web3 = new Web3(window.ethereum);
await web3.eth.getAccounts()    // Or use 'window.ethereum.request({ method: 'eth_accounts' })'.
.then((accounts) => {
    // If wallet connected, then initialize dapp with account information.
    console.log('Connected account address(es): ' + accounts);
    if (accounts.length > 0) {
        initConnectedDapp();
    // Else load dapp in read-only mode, awaiting user to initiate wallet connection.
    } else {
        // Setup the UI to await wallet connection.
        $metamaskLogo.style.visibility = "visible";
        $metamaskLogoGlow.style.visibility = "visible";
        $metamaskText.style.visibility = "visible";

        // Listen for a wallet connection request by the user (if relevant).
        $metamaskLogo.addEventListener('click', async () => { connectWallet() })
        $metamaskText.addEventListener('click', async () => { connectWallet() })
    }
})
.catch((err) => {
    genericErrHandler(err,'checking for connected accounts', false);

    // Presume no wallet connection.
    // Setup the UI to await wallet connection.
    $metamaskLogo.style.visibility = "visible";
    $metamaskLogoGlow.style.visibility = "visible";
    $metamaskText.style.visibility = "visible";

    // Listen for a wallet connection request by the user (if relevant).
    $metamaskLogo.addEventListener('click', async () => { connectWallet() })
    $metamaskText.addEventListener('click', async () => { connectWallet() })
});


/***************************************************
 * @dev Handle user request to connect to Metamask wallet.
 */
async function connectWallet() {
    // Check if a wallet is installed
    if (window.ethereum) {
        // Request the user to connect accounts (wallet will prompt the user).
        await window.ethereum.request({method: 'eth_requestAccounts'})
        .then(() => {
            // Fade out the metamask logo and text.
            fadeOutElement($metamaskLogo);
            fadeOutElement($metamaskLogoGlow);
            fadeOutElement($metamaskText);
            // Initialize the dapp with the wallet connection and information.
            setTimeout(() => {
                $metamaskLogo.remove();
                $metamaskLogoGlow.remove();
                $metamaskText.remove();
                document.getElementById('logo2').style.visibility = "visible";
                document.getElementById('onStartNotice').style.visibility = "visible";

                document.getElementById('onStartNotice').addEventListener('click', async () => {
                    fadeOutElement(document.getElementById('onStartNotice'));
                    setTimeout(() => { initConnectedDapp(); },1000);     // Wait for the fade function to complete.
                });
            },1000);     // Wait for the fade function to complete.
        })
        .catch((err) => {
            // If EIP-1193 userRejectedRequest error (the user rejected the connection request).
            if (err.code === 4001) {
                displayNotification('Please allow connection to Metamask.', 5000);
            // Else another error.
            } else {
                document.getElementById('connectedAccount').innerText = err;
                displayNotification('There was an error connecting to Metamask. Please reload the page to try again.', undefined);
                genericErrHandler(err,'connecting to wallet', false);
            }
        });
    } else {
        // Alert the user to download Metamask.
        displayNotification('Please install the Metamask browser extension.', 5000);
    }
}


/***************************************************
 * @dev Initialize the dapp after wallet connection.
 */
async function initConnectedDapp() {
    // Setup the UI.
    document.getElementById('onStartNotice').style.visibility = "hidden";
    document.getElementById('logo2').style.visibility = "visible";
    document.getElementById('accountDataBottomRight').style.opacity = 0;
    document.getElementById('accountDataBottomRight').style.visibility = "visible";
    fadeInElement(document.getElementById('accountDataBottomRight'));
    document.getElementById('mainContainer').style.opacity = 0
    document.getElementById('mainContainer').style.visibility = "visible";
    fadeInElement(document.getElementById('mainContainer'));

    // Listen for reload calls from other tabs, if the dapp is open in multiple tabs and a tx is initiated from one of them.
    window.addEventListener("storage", messageReceive);

    // Get currently connected network and prompt user to change if necessary.
    // If network acceptable, get accounts, current balance, and block number.
    await window.ethereum.request({ method: "eth_chainId" })
    .then(async (_chainId) => {
        chainId = _chainId;

        let tokenSelector = document.getElementById('tokenSelector');

        // If on Ethereum Mainnet.
        if (chainId == "0x1") {
            document.getElementById('chainID').innerText = "Network: Ethereum Mainnet";
            document.getElementById('chainID').style.color = "white";
            etherscanEndpoint = 'https://api.etherscan.io/api';
            etherscanApiKey = 'MI8AHYI1T98MZB61F55CSZCAWGFC8DR6DQ';
            infuraEndpoint = 'https://mainnet.infura.io/v3/0bb37f2d858f4d15919ed5a06f862776';
            infuraWSS = 'wss://mainnet.infura.io/ws/v3/0bb37f2d858f4d15919ed5a06f862776';
            web3_InfuraWS = new Web3(new Web3.providers.WebsocketProvider(infuraWSS));
            linkUrlPrefix = 'https://etherscan.io/tx/';
            validChain = 1;
            // Populate the token selector dropdown list.
            tokenSelector.add(new Option('USDT','USDT'));
            tokenSelector.add(new Option('BNB','BNB'));
            tokenSelector.add(new Option('XRP','XRP'));
            tokenSelector.add(new Option('LINK','LINK'));
        // If on Sepolia Testnet.
        } else if (chainId == "0xaa36a7") {
            document.getElementById('chainID').innerText = "Network: Sepolia Testnet";
            document.getElementById('chainID').style.color = "white";
            etherscanEndpoint = 'https://api-sepolia.etherscan.io/api';
            etherscanApiKey = 'MI8AHYI1T98MZB61F55CSZCAWGFC8DR6DQ';
            infuraEndpoint = 'https://sepolia.infura.io/v3/0bb37f2d858f4d15919ed5a06f862776';
            infuraWSS = 'wss://sepolia.infura.io/ws/v3/0bb37f2d858f4d15919ed5a06f862776';
            web3_InfuraWS = new Web3(new Web3.providers.WebsocketProvider(infuraWSS));
            linkUrlPrefix = 'https://sepolia.etherscan.io/tx/';
            validChain = 2;
            // Populate the token selector dropdown list.
            tokenSelector.add(new Option('USDC','USDC'));
        // Else prompt user to select a valid network.
        } else {
            document.getElementById('chainID').innerText = "Unrecognised network. Please select a valid network in the Metamask extension.";
            document.getElementById('chainID').style.color = "rgb(255, 140, 0)";
            displayNotification('Invalid network. ' + 
                'Please click to switch to ' + 
                '<span style="color: white; font-weight: bold; text-decoration-line: underline; cursor: pointer;" onclick="switchNetwork(0x1)">Ethereum</span> or ' + 
                '<span style="color: white; font-weight: bold; text-decoration-line: underline; cursor: pointer;" onclick="switchNetwork(0xaa36a7)">Sepolia Testnet</span>', undefined);
            validChain = 0;
        }

        // Get the connected accounts and current balance (progress through part of this, even if a valid network is not selected).
        await web3.eth.getAccounts()
        .then(async (_accounts) => {
            accounts = _accounts;
            // Display the account address.
            document.getElementById('connectedAccount').innerText = accounts[0];
            console.log('Number of connected accounts: ' + accounts.length);
            if (validChain > 0) {
                // Access the currently selected token contract.
                await accessTokenContract()
                .then(async () => {
                    // Display the user's token balance.
                    refreshAccountBalance();
                    // Check to restore a prior dapp session.
                    restorePriorSession();
                })
                .catch((err) => {
                    displayNotification('There was an error accessing one or more token contracts. Please reload the page to try fix this.', undefined);
                    genericErrHandler(err,'accessing token contract', false);
                });
            }
        })
        .catch((err) => {
            displayNotification('There was an error fetching the wallet\'s accounts. Please reload the page to try again.', 5000);
            genericErrHandler(err,'fetching accounts', false);
        });
    })
    .catch((err) => {
        displayNotification('There was an error fetching the current chain ID. Please reload the page to try again.', 5000);
        genericErrHandler(err,'fetching chain ID', false);
    });

    // On network change events, reload the page.
    window.ethereum.on("chainChanged", (chainId) => { window.location.reload(true); });

    // On account change events, reload the page.
    window.ethereum.on("accountsChanged", (accounts) => { window.location.reload(true); });
}


/***************************************************
 * @dev Check browser local storage for a saved state
 *      or prior transactions to load into the dapp.
 */
function restorePriorSession() {
    // Determine what suffix to use for this account.
    let storedAccounts = localStorage.getItem('accounts');
    // If no accounts are stored on this browser yet.
    if (storedAccounts == null) {
        localStorage.setItem('accounts', accounts[0]);
        storedAccountIndex = 1;
    // Else if there is one or more accounts stored.
    } else {
        // Search the stored accounts for one matching the currently connected account.
        let itemArray = storedAccounts.split('@');
        storedAccountIndex = undefined;
        for (let i = 0; i < itemArray.length; i++) {
            if (accounts[0] == itemArray[i]) {
                storedAccountIndex = i + 1;
                break;
            }
        }
        // If 'storedAccountIndex == undefined', then the current account is new, so store it.
        if (storedAccountIndex == undefined) {
            storedAccountIndex = itemArray.length + 1;
            localStorage.setItem('accounts', localStorage.getItem('accounts') + '@' + accounts[0]);
        }
    }
    document.getElementById('storedAccountIndex').innerHTML = storedAccountIndex;

    // Check if we need to load a prior pending tx from before this instance of the dapp was started.
    let priorPendingTx = localStorage.getItem('pendingTx_' + storedAccountIndex);
    if (priorPendingTx != null) {
        let itemArray = priorPendingTx.split('@');
        pendingTxHash = itemArray[0];

        // Check whether the tx is confirmed, in case the browser was closed while the tx was pending.
        console.log('Checking the status of a pending tx from the last dapp session...');
        web3.eth.getTransaction(pendingTxHash)
        .then((txData) => {
            // If the tx has been mined.
            if (txData.blockNumber != null) {
                // Load the normal UI, and remove local storage pertaining to this formerly pending tx.
                console.log('Transaction is now confirmed.');
                if (localStorage.getItem('priorTx' + validChain + '_' + storedAccountIndex) == null) {
                    localStorage.setItem('priorTx' + validChain + '_' + storedAccountIndex,
                        pendingTxHash + '@' +
                        txData.blockNumber
                    );
                } else {
                    localStorage.setItem('priorTx' + validChain + '_' + storedAccountIndex,
                        localStorage.getItem('priorTx' + validChain + '_' + storedAccountIndex) + '@' + 
                        pendingTxHash + '@' + 
                        txData.blockNumber
                    );
                }
                // Update storage and placeholders.
                localStorage.removeItem('pendingTx_' + storedAccountIndex);
                localStorage.removeItem('txLog1_' + storedAccountIndex);
                localStorage.removeItem('txLogTitle_' + storedAccountIndex);
                localStorage.removeItem('txDetailsTitle_' + storedAccountIndex);
                localStorage.removeItem('txDetails_' + storedAccountIndex);
                pendingTxHash = '';
            // Else it is still pending.
            } else {
                // Import the other necessary data from local storage.
                pendingBlockNum = Number(itemArray[1]);
                pendingNonce = Number(itemArray[2]);
                pendingGasPriceWei = BigInt(itemArray[3]);
                txSubmissions = Number(itemArray[4]);
                if (itemArray[5] == 'true') { STATE_cancellingTx = true } else { STATE_cancellingTx = false }
                STATE_pendingTx = true
                document.getElementById('processTransaction').innerText = 'Pending Transaction...';
                $txLog1.innerHTML = localStorage.getItem('txLog1_' + storedAccountIndex);
                $txLogTitle.innerHTML = localStorage.getItem('txLogTitle_' + storedAccountIndex);
                $txLogHeader.innerHTML = '';
                $txDetailsTitle.innerHTML = localStorage.getItem('txDetailsTitle_' + storedAccountIndex);
                $txDetails.innerHTML = localStorage.getItem('txDetails_' + storedAccountIndex);
                subscribeToPendingTxs();    // Subscribe to catch new pending txs.
                console.log('Transaction is still pending.');
            }
        })
        .catch((err) => {
            if (err.code == 430) {
                console.log('Formerly pending transaction no longer exists. It must have been cancelled or replaced with a new transaction of a higher gas fee.');
            } else {
                genericErrHandler(err,'processing a formerly pending transaction. Process aborted', false);
            }
            // Discard all items related to pending txs.
            localStorage.removeItem('pendingTx_' + storedAccountIndex);
            localStorage.removeItem('txLog1_' + storedAccountIndex);
            localStorage.removeItem('txLogTitle_' + storedAccountIndex);
            localStorage.removeItem('txDetailsTitle_' + storedAccountIndex);
            localStorage.removeItem('txDetails_' + storedAccountIndex);
            pendingTxHash = '';
        });
    }

    // Display the latest mined block and subscribe to new block header events.
    getLatestBlock();
}


/***************************************************
 * @dev Listen for a transaction request by the user
 *      and handle it when made.
 */
document.getElementById('processTransaction').addEventListener('click', async () => {
    // Do not proceed if we are still awaiting the first round of fee estimates.
    if (STATE_awaitingFeeEstimates) return;
    // Do not proceed if a tx is already pending.
    if (STATE_pendingTx) {
        displayNotification('A transaction is already pending. Please wait for it to complete. You can speed up or cancel pending transactions in Metamask.', 7000);
        return;
    }

    // Check that valid tx details have been provided.
    if (document.getElementById('recipientAddress').style.borderColor == "red" ||
        document.getElementById('sendAmount').style.borderColor == "red" ||
        document.getElementById('recipientAddress').value == "" ||
        document.getElementById('sendAmount').value == "")
    {
        displayNotification('Some inputs are invalid or empty. Please check and try again.', 3000);
        return;
    }
    let toAddress = document.getElementById('recipientAddress').value;

    // Parse the amount to send.
    let amountEntered = document.getElementById('sendAmount').value;    // String.
    let amountToSend = (new Big(new Big(10).pow(tokenDecimals)).times(amountEntered)).toString();

    // Suspend UI new block processing until tx is submitted or cancelled.
    // (This is to avoid conflicts in the UI if a new block is being processed while a new tx submission is also being processed).
    STATE_submittingTx = true;
    // Block new transactions from being submitted while one is still pending.
    STATE_pendingTx = true;
    document.getElementById('processTransaction').innerText = 'Pending Transaction...';

    // Prepare the transaction, to be presented to the user via their wallet, where
    // the user will also confirm or reject the transaction.
    // The following transaction method works for erc20 tokens (tokens governed by a smart contract).
    // ETH is the native network token and is governed by the protocol itself.
    // To transact ETH use 'await window.ethereum.request({method: "eth_sendTransaction", ...'.
    await tokenContract.methods.transfer(toAddress, amountToSend)
    .send({
        from: accounts[0],
        gas: 65000              // The gas for sending ERC-20 tokens is 65000, https://ethereum.org/en/gas/.
    })
    /* The event 'on("sending")' fires when the dapp sends the tx to metamask for user confirmation.
       The event 'on("sent")' fires when metamask sends the tx to the mempool.*/
    // This even fires when metamask sends the tx to the mempool. Use the tx hash to track the tx in custom code from here on.
    .on("transactionHash", (transactionHash) => {
        monitorTx(transactionHash);
    })
    /* The following events do not fire if the tx is cancelled (which includes being replaced with a higher gas fee, which means a new tx).
       If the user speeds up the tx by increasing gas fee, none of the 'methods.transfer' events fire, because the speeding-up
       is done through the metamask extension, not through this web3js code. The replacement tx must therefore be handled a
       separate way. Therefore, none of the following events will be used in this dapp, as they cannot be relied upon for all txs.*/
    /* The event 'on("receipt")' fires when the tx is included in a new block. It returns useful tx information.
       The event 'on("confirmation")' fires when the tx is included in a new block. Contains the receipt above, plus num confirmations ( = 1) and block hash. Not particularly useful.*/
    .on("error", (err) => {
        STATE_submittingTx = false;
        displayNotification('There was an error submitting the transaction. Please reload the page to try fix this.', undefined);
        genericErrHandler(err,'fetching chain ID', false);
    })
    .catch((err) => {
        STATE_submittingTx = false;
        STATE_pendingTx = false;
        document.getElementById('processTransaction').innerText = 'Submit Transaction';
        if (err.code == 100) {
            displayNotification('You cancelled the transaction', 3000);
        } else {
            genericErrHandler(err,'sending transaction', true);
        }
    });
});


/***************************************************
 * @dev Create objects to point to token contracts.
 */
async function accessTokenContract() {
    // Get token.
    token = document.getElementById('tokenSelector').value;
    // Get its contract address.
    let contractAddress;
    if (chainId == "0x1") {     // Ethereum mainnet (tokens: https://etherscan.io/tokens).
        if (token == "BNB") contractAddress = '0xB8c77482e45F1F44dE1745F52C74426C631bDD52';
        if (token == "USDT") contractAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
        if (token == "XRP") contractAddress = '0x628f76eab0c1298f7a24d337bbbf1ef8a1ea6a24';
        if (token == "LINK") contractAddress = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
    } else if (chainId == "0xaa36a7") {     // Sepolia testnet.
        if (token == "USDC") contractAddress = '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8';
    }

    // Use a generic ABI with the functions that we need.
    // Implements: transfer(), balanceOf(), and decimals().
    const erc20TokenABI = [
        {"constant": true,"inputs": [{"name": "_owner","type": "address"}],"name": "balanceOf","outputs": [{"name": "balance","type": "uint256"}],"payable": false,"stateMutability": "view","type": "function"},
        {"constant": false,"inputs": [{"name": "_to","type": "address"},{"name": "_value","type": "uint256"}],"name": "transfer","outputs": [{"name": "","type": "bool"}],"payable": false,"stateMutability": "nonpayable","type": "function"},
        {"constant": true,"inputs": [],"name": "decimals","outputs": [{"name": "","type": "uint8"}],"payable": false,"stateMutability": "view","type": "function"}
    ];

    tokenContract = new web3.eth.Contract(erc20TokenABI, contractAddress);
    tokenDecimals = Number(await tokenContract.methods.decimals().call());
}


/***************************************************
 * @dev Handle when the user selects a different token.
 */
export async function changeToken() {
    document.getElementById('tokenBalance').innerText = 'Fetching...';
    document.getElementById('ethBalance').innerText = '';
    await accessTokenContract()
    .then(() => {
        refreshAccountBalance();
    })
}


/***************************************************
 * @dev Refresh the account balances (the ERC20 token and ETH).
 */
export async function refreshAccountBalance() {
    document.getElementById('tokenBalance').innerText = 'Fetching...';
    document.getElementById('ethBalance').innerText = '';

    // Get balance of the selected token.
    await tokenContract.methods.balanceOf(accounts[0]).call()
    .then( async (balance) => {
        //console.log(balance);
        //console.log(tokenDecimals);
        let a = new Big(balance);
        let b = new Big(10**tokenDecimals);
        let c = a.div(b);
        tokenBalance = c.toString(); //await web3.utils.fromWei(bal, 'ether');
        if (displayBalance) {
            document.getElementById('tokenBalance').innerHTML = parseFloat(c.toFixed(9)) + ' ' + token + ' <span style="font-size: 0.9cqmax">(to send)</span>'; // parseFloat is to remove trailing zeros.
        } else {
            document.getElementById('tokenBalance').innerHTML = new Array(18).join('\u{25CF}');
        }
    })
    .catch((err) => {
        displayNotification(`The contract call \'methods.balanceOf()\' to retrieve your ${token} balance appears to not be responding.<br><br>Please reload the page to try and fix this.`, 6000);
        genericErrHandler(err,'fetching token account balance', false);
    });

    // Also get ETH balance, for paying tx fees.
    await web3.eth.getBalance(accounts[0])
    .then( async (weiBalance) => {
        ethBalance = web3.utils.fromWei(weiBalance, 'ether');
        if (displayBalance) {
            document.getElementById('ethBalance').innerHTML = Number(ethBalance).toFixed(11) + ' ETH <span style="font-size: 0.9cqmax">(for fees)</span>';
        } else {
            document.getElementById('ethBalance').innerHTML = '';
        }
    })
    .catch((err) => {
        displayNotification('The call to \'web3.eth.getBalance()\' appears to not be responding.<br><br>Please reload the page to try and fix this.', 6000);
        genericErrHandler(err,'fetching ETH account balance', false);
    });
}


/***************************************************
 * @dev Get the current block on the network, and subscribe
 *      to new block header events for continuous monitoring.
 */
async function getLatestBlock() {
    window.ethereum.request({
        method: 'eth_getBlockByNumber',
        params: ['latest', true],
    })
    .then(async (blockHeader) => {
        blockNumberOnWalletLoad = Number(blockHeader.number);
        document.getElementById('blockAtReload').innerText = "Block number at dapp start: " + blockNumberOnWalletLoad;
        processLatestBlock(Number(blockHeader.number));
    })
    .catch((err) => { genericErrHandler(err,'fetching latest block', false); });

    // Subscribe to web3js to monitor new block generation and analyze an active tx if applicable.
    // Using Infura.io. Could also use 'web3.eth.subscribe' directly, but Infura events fire in a more timely manner.
    subscribe_newBlocks = await web3_InfuraWS.eth.subscribe('newHeads', function(err, result) {
        if (err) console.log(err);
    });
    subscriptions[0] = true;
    console.log('\n>>> LISTENING FOR NEW BLOCK HEADERS ...\n');
    subscribe_newBlocks.on('data', (blockHeader) => { 
        console.log('New block: ' + Number(blockHeader.number));
        processLatestBlock(Number(blockHeader.number))
    });
}


/***************************************************
 * @dev Process the latest block by updating the estimates
 *      about gas fees and expected time of mining transactions.
 *      Also refresh the list of prior transactions, each with
 *      their current number of confirmations.
 * @param blockNumber - The number of the most recent block (Number).
 */
async function processLatestBlock(blockNumber) {
    currentBlockNumber = blockNumber;
    document.getElementById('latestBlock').innerText = "Latest block: " + currentBlockNumber;

    if (STATE_submittingTx) return;     // Abort remaining processing a new tx is being setup in metamask.

    // If we're just coming from a confirmed tx, then clear the data (makes for a cleaner UI update).
    if ($txLog1.innerHTML == 'CONGRATULATIONS!') {
        $txLog1.innerHTML = '';
        $txLog2.innerHTML = '';
        $txLog3.innerHTML = '';
        $txLog4.innerHTML = '';
        $txDetails.innerHTML = '';
    }

    // If there is no active tx, then with each new block update the gas fee estimate and all past txs.
    if (pendingBlockNum == undefined) {

        // Update gas fee estimates and expected confirmation time.
        let priorityFeeGwei;
        let fastPriorityFeeGwei;
        let baseFeeGwei;
        let safeMaxFeeGwei;
        let txLog1Prefix = 'Current base fee:&nbsp;&nbsp;';
        let txLog2Prefix = 'Priority fee:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
        let txLog3Prefix = 'Fast priority fee:&nbsp;';
        let txLog4Prefix = 'Safe max fee:&nbsp;&nbsp;&nbsp;';
        let response;
        $txLogTitle.innerHTML = 'Fee & mining time estimates <span style="color: #90e0ff; cursor: pointer;" onclick="specialMessage_EstGasInfo()">&#9432</span>';
        $txLogHeader.innerHTML = '<span style="text-decoration-line: underline;">FEE TYPE&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbspGWEI&nbsp&nbsp&nbsp&nbsp&nbspMINE IN</span>';
        // If on Ethereum Mainnet (can use regular etherscan API).
        if (validChain == 1) {
            // First get fee estimates.
            let url = `${etherscanEndpoint}?module=gastracker&action=gasoracle&apikey=${etherscanApiKey}`;  // Results returned in GWEI.
            response = await (await fetch(url)).json();
            if (response.message == 'OK') {
                baseFeeGwei = parseFloat(Number(response.result['suggestBaseFee']).toFixed(4));
                let priorityFeeGwei_temp = Number(response.result['ProposeGasPrice']) - Number(response.result['suggestBaseFee']);
                priorityFeeGwei = parseFloat(priorityFeeGwei_temp.toFixed(4));
                let fastPriorityFeeGwei_temp = Number(response.result['FastGasPrice']) - Number(response.result['suggestBaseFee']);
                fastPriorityFeeGwei = parseFloat(fastPriorityFeeGwei_temp.toFixed(4));
                safeMaxFeeGwei = Number(2 * Number(baseFeeGwei) + Number(fastPriorityFeeGwei)).toFixed(4);

                // Then get estimated confirmation times.
                let gasPriceWei = web3.utils.toWei((baseFeeGwei + priorityFeeGwei).toString(), 'gwei');   // Returns a String when given a String.
                url = `${etherscanEndpoint}?module=gastracker&action=gasestimate&gasprice=${gasPriceWei}&apikey=${etherscanApiKey}`;
                let response1 = await (await fetch(url)).json();

                gasPriceWei = web3.utils.toWei((baseFeeGwei + fastPriorityFeeGwei).toString(), 'gwei');   // Returns a String when given a String.
                url = `${etherscanEndpoint}?module=gastracker&action=gasestimate&gasprice=${gasPriceWei}&apikey=${etherscanApiKey}`;
                let response2 = await (await fetch(url)).json();

                gasPriceWei = web3.utils.toWei(safeMaxFeeGwei.toString(), 'gwei');   // Returns a String when given a String.
                url = `${etherscanEndpoint}?module=gastracker&action=gasestimate&gasprice=${gasPriceWei}&apikey=${etherscanApiKey}`;
                let response3 = await (await fetch(url)).json();

                $txLog1.innerHTML = txLog1Prefix + baseFeeGwei;
                if (response1.message == 'OK') $txLog2.innerHTML = (txLog2Prefix + priorityFeeGwei).replaceAll('&nbsp;',' ').padEnd(28).replaceAll(' ','&nbsp;') + Number(response1.result) + ' sec';
                if (response2.message == 'OK') $txLog3.innerHTML = (txLog3Prefix + fastPriorityFeeGwei).replaceAll('&nbsp;',' ').padEnd(28).replaceAll(' ','&nbsp;') + Number(response2.result) + ' sec';
                if (response3.message == 'OK') $txLog4.innerHTML = '<span style="color: #90e0ff; cursor: pointer;" onclick="specialMessage_SafeMaxFeeInfo()">&#9432</span>&nbsp' + 
                    (txLog4Prefix + safeMaxFeeGwei).replaceAll('&nbsp;',' ').padEnd(25).replaceAll(' ','&nbsp;') + Number(response3.result) + ' sec';
            }

        // If on Sepolia Testnet (need to use the infura.io API, as etherscan on the Sepolia network is lacking Gas methods).
        } else if (validChain == 2) {
            // Get the priority fee estimate.
            axios.post(infuraEndpoint, { jsonrpc: '2.0', method: 'eth_maxPriorityFeePerGas', params: [], id: 1 })   // Results returned in WEI.
            .then((response) => {
                let priorityFeeWei = web3.utils.hexToNumber(response.data.result, true);
                priorityFeeGwei = parseFloat(Number(web3.utils.fromWei(priorityFeeWei, 'gwei')).toFixed(4));
                $txLog2.innerHTML = txLog2Prefix + priorityFeeGwei;
                $txLog2.innerHTML = ($txLog2.innerHTML).replaceAll('&nbsp;',' ').padEnd(28).replaceAll(' ','&nbsp;') + 'N/A';

                fastPriorityFeeGwei = (priorityFeeGwei + 0.5).toFixed(4);
                $txLog3.innerHTML = txLog3Prefix + fastPriorityFeeGwei;
                $txLog3.innerHTML = ($txLog3.innerHTML).replaceAll('&nbsp;',' ').padEnd(28).replaceAll(' ','&nbsp;') + 'N/A';

                // Get the gas price estimate.
                axios.post(infuraEndpoint, { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 })   // Results returned in WEI.
                .then((response) => {
                    let maxFeeWei = web3.utils.hexToNumber(response.data.result, true);
                    let maxFeeGwei = parseFloat(Number(web3.utils.fromWei(maxFeeWei, 'gwei')).toFixed(4));

                    baseFeeGwei = (maxFeeGwei - priorityFeeGwei).toFixed(4);
                    $txLog1.innerHTML = txLog1Prefix + baseFeeGwei;

                    safeMaxFeeGwei = Number(2 * Number(baseFeeGwei) + Number(fastPriorityFeeGwei)).toFixed(4);
                    $txLog4.innerHTML = txLog4Prefix + safeMaxFeeGwei;
                    $txLog4.innerHTML = '<span style="color: #90e0ff; cursor: pointer;" onclick="specialMessage_SafeMaxFeeInfo()">&#9432</span>&nbsp' + 
                        ($txLog4.innerHTML).replaceAll('&nbsp;',' ').padEnd(25).replaceAll(' ','&nbsp;') + 'N/A';
                })
                .catch((err) => {
                    displayNotification('Infura.io HTTP calls to JSON RPC methods (specifically \'eth_gasPrice\') appears to not be responding.<br><br>You may need to wait to see updated gas price estimates, or try reloading the page.', 8000);
                    genericErrHandler(err,'fetching Sepolia gas price from Infura', false);
                });
            })
            .catch((err) => {
                displayNotification('Infura.io HTTP calls to JSON RPC methods (specifically \'eth_maxPriorityFeePerGas\') appears to not be responding.<br><br>You may need to wait to see updated gas price estimates, or try reloading the page.', 8000);
                genericErrHandler(err,'fetching Sepolia max priority fee from Infura', false);
            });
        }

        STATE_awaitingFeeEstimates = false;
        document.getElementById('processTransaction').innerText = 'Submit Transaction';

        // Update past txs.
        $txDetailsTitle.innerHTML = 'Past transactions <span style="color: #90e0ff; cursor: pointer;" onclick="specialMessage_PastTxInfo()">&#9432</span>&emsp;&emsp;&emsp;<span class="clickable" style="font-weight: normal; font-size: 0.8cqmax; cursor: pointer;" title="Clear this list of past transactions" onclick="clearTxHistory()">[Clear history]</span>';
        // Get any prior txs from local storage.
        let priorTxsString = localStorage.getItem('priorTx' + validChain + '_' + storedAccountIndex);
        //console.log(localStorage.getItem('priorTx1_1'));
        if (priorTxsString != null) {       // If there are prior txs.
            let itemArray = priorTxsString.split('@');
            let txArray = [];
            for (let i = 0; i < itemArray.length; i += 2) {
                let txHash = itemArray[i];
                let confirmationBlockNumber = Number(itemArray[i + 1]);
                let confirmations = currentBlockNumber - confirmationBlockNumber;
                txArray.push(buildPastTxString( txHash, confirmations.toString(), linkUrlPrefix ));
            }
            txArray.reverse();      // Put the most recent tx first.
            $txDetails.innerHTML = '';
            let txStr = '';
            txArray.forEach((newStr) => { txStr += newStr + '<br>'; });
            $txDetails.innerHTML = txStr;
        } else {
            $txDetails.innerHTML = '(No prior txs on this network in this portal)';
        }

    // Else there is a pending tx.
    } else {

        // First check whether the tx is confirmed.
        web3.eth.getTransaction(pendingTxHash)
        .then((txData) => {
            // If the tx has been mined.
            if (txData.blockNumber != null) {
                processConfirmedTx(txData);
            // Else it is still pending.
            } else {
                // Update the number of blocks it has been pending for.
                let pendingBlocks = currentBlockNumber - pendingBlockNum;
                if (pendingBlocks < 0) pendingBlocks = '?';
                let tempStr = $txLog1.innerHTML;
                let index = tempStr.search('Pending');
                tempStr = tempStr.substring(0, index);
                if (txSubmissions == 1) {
                    if (pendingBlocks == 1) {
                        $txLog1.innerHTML = tempStr + `Pending... (${pendingBlocks} block)<br><br><span style="font-family: sans-serif; font-weight: bold; color: #ff8c00">You may speed up or cancel the<br> transaction in Metamask</span>`;
                    } else {
                        $txLog1.innerHTML = tempStr + `Pending... (${pendingBlocks} blocks)<br><br><span style="font-family: sans-serif; font-weight: bold; color: #ff8c00">You may speed up or cancel the<br> transaction in Metamask</span>`;
                    }
                } else {
                    if (pendingBlocks == 1) {
                        $txLog1.innerHTML = tempStr + `Pending... (${pendingBlocks} block)`;
                    } else {
                        $txLog1.innerHTML = tempStr + `Pending... (${pendingBlocks} blocks)`;
                    }
                }
            }
        })
        .catch((err) => {
            displayNotification('The tx you just submitted has made it to the mempool, but an error occured while attempting to track it from there. Please monitor the tx in your metamask extension. If the transaction is mined it will still show in the \'Past transactions\' list in this dapp.', 8000);
            genericErrHandler(err,'fetching transaction data', false);
        });

    }
}


/***************************************************
 * @dev Monitor a pending by getting its broader data,
 *      calling a more detailed monitoring method, and
 *      subscribing to monitor new pending transactions
 *      on the network for as long as this transaction 
 *      is pending.
 * @param txHash - the hash of the current pending transaction (String).
 */
async function monitorTx(txHash) {
    // Set the block number at which the tx was submitted.
    pendingBlockNum = currentBlockNumber;
    STATE_submittingTx = false;     // Resume UI new block processing.

    // Clear part of the UI, ready for tx data.
    $txDetailsTitle.innerText = '';
    $txDetails.innerText = '';
    $txLogTitle.innerText = '';
    $txLogHeader.innerText = '';
    $txLog1.innerText = '';
    $txLog2.innerText = '';
    $txLog3.innerText = '';
    $txLog4.innerText = '';

    // Get the metadata of the initial pending tx.
    web3.eth.getTransaction(txHash)
    .then((txData) => {
        processNewPendingTx(txData);
    })
    .catch((err) => {
        displayNotification('The tx you just submitted has made it to the mempool, but an error occured while attempting to track it from there. Please monitor the tx in your metamask extension. If the transaction is mined it will still show in the \'Past transactions\' list in this dapp.', 8000);
        genericErrHandler(err,'fetching transaction data', false);
    })

    subscribeToPendingTxs();
}


/***************************************************
 * @dev Subscribe to catch new pending transactions via
 *      the Infura.io websocket service.
 */
async function subscribeToPendingTxs() {
    // Subscribe to Infura to monitor new pending txs, for when the user speeds up a currently
    // pending tx with a higher gas fee. (The Web3js functions 'web3.eth.getPendingTransactions()' and
    // 'web3.eth.subscribe('pendingTransactions')' do not seem to work properly.)
    // Dapp is designed to handle only one pending tx at a time.
    subscribe_pendingTx = await web3_InfuraWS.eth.subscribe('newPendingTransactions', function(err, result) {
        if (err) console.log(err)
    });
    subscriptions[1] = true;
    console.log('\n>>> LISTENING TO CATCH A RE-SUBMITTED TX ...\n');
    subscribe_pendingTx.on('data', (txHash) => {
        web3.eth.getTransaction(txHash)
        .then((response) => {
            let txData = response;
            // If a new pending tx is detected from this address.
            if (txData.from.toLowerCase() == accounts[0].toLowerCase()) {
                // Ensure it is a resubmission by ensuring the nonce is equal to the original pending tx.
                if (txData.nonce == pendingNonce) processNewPendingTx(txData);
            }
        })
        .catch((err) => {
            // 430 errors are just 'Transaction not found', of which there are a few when we are scanning every new pending tx.
            if (err.code != 430) genericErrHandler(err,'fetching transaction data', false);
        });
    });
}

/***************************************************
 * @dev Process a new pending transaction. It could be
 *      an original transaction, or one to replace the
 *      original (such as with a higher gas fee, or with
 *      zero value to cancel the transaction).
 * @param txData - the JSON data object for this transaction.
 */
async function processNewPendingTx(txData) {
    
    // Check that we are not processing the same tx twice.
    if (txData.hash == pendingTxHash) return;

    // Estimate confirmation time using Etherscan API.
    let confTimeStr = 'N/A on Sepolia Testnet';
    let secondsTillMining = 'N/A on Sepolia Testnet';
    if (validChain == 1) {      // Ethereum mainnet.
        let url = `${etherscanEndpoint}?module=gastracker&action=gasestimate&gasprice=${txData.gasPrice}&apikey=${etherscanApiKey}`;
        let response = await (await fetch(url)).json();
        // Process the result.
        if (response.message == 'OK') {
            secondsTillMining = Number(response.result);
            confTimeStr = (new Date(Date.now() + secondsTillMining * 1000)).toString();
        } else {
            secondsTillMining = 'Error';
            confTimeStr = 'Error';
        }
    }

    // Output to console.
    txSubmissions++;
    let outputStr;
    if (txSubmissions == 1) { outputStr = '\n--- TX SUBMITTED TO MEMPOOL ---'; }
    else if (txSubmissions > 1) { outputStr = '\n--- TX RE-SUBMITTED TO MEMPOOL ---'; }
    outputStr = outputStr + '\n   Tx hash: ' + txData.hash;
    outputStr = outputStr + '\n   Nonce: ' + txData.nonce;
    outputStr = outputStr + '\n   Block number of tx: ' + txData.blockNumber;
    if (txSubmissions == 1) { outputStr = outputStr + '\n   Gas price: ' + txData.gasPrice; }
    else if (txSubmissions > 1) {
        outputStr = outputStr + '\n   New gas price: ' + txData.gasPrice;
        outputStr = outputStr + '\n   Gas price increase: ' + parseFloat(Number(txData.gasPrice / pendingGasPriceWei).toFixed(2)) + 'x';
    }
    outputStr = outputStr + '\n   Expected seconds until mined: ' + secondsTillMining;
    outputStr = outputStr + '\n-------------------------------\n';
    console.log(outputStr);

    // If this is a resubmission, then set the tx's block number.
    if (txSubmissions > 0) pendingBlockNum = currentBlockNumber;

    // Update UI.
    refreshAccountBalance();    // Update the account balance displayed (useful if this tx is to replace one that had a lower gas fee).
    $txDetailsTitle.innerHTML = '<span style="color: #d68513">Details of Pending Tx</span>';
    $txDetails.innerHTML =
        buildPastTxString(txData.hash, '', linkUrlPrefix) + '<br>' + 
        'Estimated mining at: ' + confTimeStr + '<br>' + 
        'Gas units: ' + txData.gas + '<br>' + 
        'Max gas price: ' + parseFloat(Number(web3.utils.fromWei(txData.gasPrice, 'gwei')).toFixed(4)) + ' GWEI';
    $txLogTitle.innerHTML = '<span style="color: #d68513">Pending Tx Log</span>';
    $txLogHeader.innerHTML = '';
    $txLog2.innerHTML = '';
    $txLog3.innerHTML = '';
    $txLog4.innerHTML = '';
    let pendingBlocks = currentBlockNumber - pendingBlockNum;
    if (pendingBlocks < 0) pendingBlocks = '?';
    if (txSubmissions == 1) {           // If this an original submission.
        $txLog1.innerHTML = `Tx submitted to mempool at block number ${pendingBlockNum}.`;
    } else if (txSubmissions > 1) {     // Else if it's a resubmission.
        let newGasPriceGwei = parseFloat(Number(web3.utils.fromWei(txData.gasPrice, 'gwei')).toFixed(4));
        let priceIncrease = parseFloat(Number(txData.gasPrice / pendingGasPriceWei).toFixed(1));
        if (txData.data == '0x') {        // User has cancelled the tx by resubmitting with zero value.
            $txLog1.innerHTML = `>>&nbspCANCELLING TRANSACTION...<br>>>&nbspNew gas price: ${newGasPriceGwei} GWEI`;
            STATE_cancellingTx = true;
            displayNotification('You have submitted a cancellation transaction.', 3000);
        } else {                        // User has resubmitted original tx with new gas price.
            $txLog1.innerHTML = `>>&nbspTx resubmitted with new gas price<br>>>&nbspNew price: ${newGasPriceGwei} GWEI`;
        }
        if (priceIncrease != 1) { $txLog1.innerHTML = $txLog1.innerHTML + `<br>>>&nbspIncrease of: ${priceIncrease}x`; }
        $txLog1.innerHTML = $txLog1.innerHTML + `<br>New tx submitted to mempool at block number ${pendingBlockNum}.`;
    }
    if (validChain == 1) { $txLog1.innerHTML = $txLog1.innerHTML + `<br>Estimated mining in ${secondsTillMining} seconds.`; }
    if (txSubmissions == 1) {
        $txLog1.innerHTML =
            $txLog1.innerHTML + `<br>Pending... (${pendingBlocks} blocks)` +
            `<br><br><span style="font-family: sans-serif; font-weight: bold; color: #ff8c00">You may speed up or cancel the<br> transaction in Metamask</span>`;
    } else if (txSubmissions > 1) {
        $txLog1.innerHTML = $txLog1.innerHTML + `<br>Pending... (${pendingBlocks} blocks)`;
    }

    // Set remaining tx placeholders.
    pendingTxHash = txData.hash;
    pendingNonce = txData.nonce;
    pendingGasPriceWei = txData.gasPrice;   // Is of type BigInt.

    // Save this data to local storage, for use if another tab is opened or the browser is closed then re-opened.
    localStorage.setItem('pendingTx_' + storedAccountIndex, 
        pendingTxHash + '@' + 
        currentBlockNumber + '@' + 
        pendingNonce + '@' + 
        pendingGasPriceWei.toString() + '@' + 
        txSubmissions + '@' + 
        STATE_cancellingTx
    );
    localStorage.setItem('txLog1_' + storedAccountIndex, $txLog1.innerHTML);
    localStorage.setItem('txLogTitle_' + storedAccountIndex, $txLogTitle.innerHTML);
    localStorage.setItem('txDetailsTitle_' + storedAccountIndex, $txDetailsTitle.innerHTML);
    localStorage.setItem('txDetails_' + storedAccountIndex, $txDetails.innerHTML);

    // Broadcast to any other open tabs to reload, so they can detect and display the pending tx.
    messageBroadcast('ReloadTxPortal');
}


/***************************************************
 * @dev Process a transaction that has been confirmed.
 * @param txData - the JSON data object for this transaction.
 */
function processConfirmedTx(txData) {

    // Output to console.
    let outputStr;
    outputStr = '\n--- TX SUBMITTED TO BLOCKCHAIN ---';
    outputStr = outputStr + '\n   Tx hash: ' + txData.hash;
    outputStr = outputStr + '\n   Nonce: ' + txData.nonce;
    outputStr = outputStr + '\n   Block number of tx: ' + txData.blockNumber;
    outputStr = outputStr + '\n----------------------------------\n';
    console.log(outputStr);

    // Update UI.
    refreshAccountBalance();
    $txLog1.innerHTML = 'CONGRATULATIONS!';
    if (STATE_cancellingTx) {
        displayNotification('Your transaction has been cancelled.', 3000);
        $txLog2.innerHTML = 'Your transaction has been successfully cancelled.';
    } else {
        displayNotification('CONGRATULATIONS! Your transaction has been confirmed.', 3000);
        $txLog2.innerHTML = 'Your transaction has been confirmed.';
    }
    $txLog3.innerHTML = '';
    $txLog4.innerHTML = '';
    document.getElementById('processTransaction').innerText = 'Submit Transaction';

    // Update local storage.
    localStorage.removeItem('pendingTx_' + storedAccountIndex);
    localStorage.removeItem('txLog1_' + storedAccountIndex);
    localStorage.removeItem('txLogTitle_' + storedAccountIndex);
    localStorage.removeItem('txDetailsTitle_' + storedAccountIndex);
    localStorage.removeItem('txDetails_' + storedAccountIndex);
    // If the local storage item does not yet exist, then don't append its existing value, but make it anew.
    if (localStorage.getItem('priorTx' + validChain + '_' + storedAccountIndex) == null) {
        localStorage.setItem('priorTx' + validChain + '_' + storedAccountIndex,
            pendingTxHash + '@' +
            txData.blockNumber
        );
    // Else if it exists, first ensure that another open instance of the dapp has not already saved this tx to local storage.
    } else if (localStorage.getItem('priorTx' + validChain + '_' + storedAccountIndex).indexOf(pendingTxHash) == -1) {
        localStorage.setItem('priorTx' + validChain + '_' + storedAccountIndex,
            localStorage.getItem('priorTx' + validChain + '_' + storedAccountIndex) + '@' + 
            pendingTxHash + '@' + 
            txData.blockNumber
        );
    }

    // Reset tx placeholders.
    pendingTxHash = '';
    pendingNonce = -1;
    pendingGasPriceWei = 0;
    txSubmissions = 0;
    pendingBlockNum = undefined;
    STATE_cancellingTx = false;
    STATE_pendingTx = false;

    // Unsubscribe from the pendingTx event listener.
    let success = subscribe_pendingTx.unsubscribe();
    if (!success) window.location.reload(true);   // Reload the page if unsubscription fails.
    subscriptions[1] = false;
    console.log('\n<<< CLOSED LISTENER FOR RE-SUBMITTED TXS\n');

    // Wait a few moments before reverting the UI back to its default non-transacting state.
    setTimeout(() => {
        // Clear part of the UI, ready for tx data.
        $txDetailsTitle.innerHTML = 'Past transactions <span style="color: #90e0ff; cursor: pointer;" onclick="specialMessage_PastTxInfo()">&#9432</span>';
        $txDetails.innerText = '';
        $txLogTitle.innerHTML = 'Fee & mining time estimates <span style="color: #90e0ff; cursor: pointer;" onclick="specialMessage_EstGasInfo()">&#9432</span>';
        $txLogHeader.innerHTML = '<span style="text-decoration-line: underline;">FEE TYPE&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbspGWEI&nbsp&nbsp&nbsp&nbsp&nbspMINE IN</span>';
        $txLog1.innerText = '';
        $txLog2.innerText = '';
        $txLog3.innerText = '';
        $txLog4.innerText = '';
        processLatestBlock(currentBlockNumber);
    }, 5000);
}


/***************************************************
 * @dev Toggle whether the user's balance is shown or hidden (for privacy).
 */
export function toggleDisplayBalance() {
    if (displayBalance) {
        document.getElementById('tokenBalance').innerHTML = new Array(18).join('\u{25CF}');
        document.getElementById('ethBalance').innerHTML = '';
        displayBalance = false;
    } else {
        document.getElementById('tokenBalance').innerHTML = parseFloat(Number(tokenBalance).toFixed(9)) + ' ' + token + ' <span style="font-size: 0.9cqmax">(can send)</span>'; // parseFloat is to remove trailing zeros.
        document.getElementById('ethBalance').innerHTML = Number(ethBalance).toFixed(8) + ' ETH <span style="font-size: 0.9cqmax">(for fees)</span>';
        displayBalance = true;
    }
}


/***************************************************
 * @dev Display a notification to the user of generic
 *      design but customizable content.
 * @param message - the written content to be in the notification (String).
 * @param timeout_ms - how long (in milliseconds) the notification should display for.
 *      Use 'undefined' for a permanent notification (until the user refreshes the page) (Number).
 */
export function displayNotification(message, timeout_ms) {
    clearTimeout(notificationTimer);    // Clear any previous timeout for the notification box.
    document.getElementById('notification').innerHTML = message;
    document.getElementById('notification').style.visibility = "visible";
    // 'timeout_ms' will be undefined if the notification is to be permanent until the dapp reloads (e.g. invalid network).
    if (timeout_ms != undefined) {
        notificationTimer = setTimeout(() => { document.getElementById('notification').style.visibility = "hidden"; }, timeout_ms);
    }
}


/***************************************************
 * @dev Prepare HTML text that has a clickable portion,
 *      whereby a click will update the value of a different
 *      element on the page.
 * @param label - the first part of the message, non-clickable (String).
 * @param clickable - the next part of the message, clickable (String).
 * @param idElementToChange - the ID of the HTML element that is to 
 *      change when the text is clicked (String).
 * @param newValue - the new value to apply to the HTML element
 *      given by 'idElementToChange' (String).
 * @returns The HTML formatted string with clickable functionality.
 */
function prepareClickableModifierTextLine(label, clickable, idElementToChange, newValue) {
    if (clickable.length == 0) {
        return '<span style="color: white;">' + label + '</span>';
    } else {
        return '<span style="color: white;">' + label + '</span><span class="clickable" style="color: #c5a859;" onclick="document.getElementById(`' + idElementToChange + '`).value = ' + newValue + ';">' + clickable + '</span>';
    }
}


/***************************************************
 * @dev Prepare HTML text that has a clickable portion,
 *      whereby a click will open a URL link in a new tab.
 *      This method creates a HTML element similar to
 *      <a href="">...</a>, but allows for different styling
 *      that defined for regular links.
 * @param label - the first part of the message, non-clickable (String).
 * @param clickable - the next part of the message, clickable (String).
 * @param url - the URL to open when clicked (String).
 * @returns The HTML formatted string with clickable functionality.
 */
function prepareClickableURLTextLine(label, clickable, url) {
    if (clickable.length == 0) {
        return '<span>' + label + '</span>';
    } else {
        return '<span>' + label + '</span><span class="clickable" style="font-weight: normal;" title="View on Etherscan" onclick="window.open(`' + url + '`, `_blank`);">' + clickable + '</span>';
        //return '<span>' + label + '</span><a href="' + url + '" target="blank" class="clickable">' + clickable + '</a>';
    }
}


/***************************************************
 * @dev Prepare HTML text that is designed to be part of
 *      a list of prior transactions. The hash of each
 *      transaction is clickable to open up Etherscan to view
 *      the transaction. This is similar to <a href="">...</a>,
 *      but allows for different styling that defined for regular links.
 * @param hash - the transaction hash (String).
 * @param confirmations - the current number of confirmations of this transaction (String).
 * @param linkUrlPrefix - the prefix for the Etherscan URL, dependent on which network is selected (String).
 * @returns The HTML formatted string with clickable functionality.
 */
function buildPastTxString(hash, confirmations, linkUrlPrefix) {
    let hashStr = hash.substring(0, 5) + '...' + hash.substring(hash.length - 4, hash.length - 1);
    hashStr = prepareClickableURLTextLine('Hash: ', hashStr, linkUrlPrefix + hash)
    if (confirmations.length > 0) {
        if (confirmations == "1") { return hashStr + ', ' + confirmations + ' confirmation'; }
        else { return hashStr + ', ' + confirmations + ' confirmations'; }
    }
    else { return hashStr; }
}


/***************************************************
 * @dev Fade out a HTML element.
 * @param elementRef - a reference to the HTML element
 *      to which the fade is to be applied.
 */
function fadeOutElement(elementRef) {
    let opacity = 1;
    enactFade(elementRef);
    function enactFade(elementRef) {
        if (opacity > 0) {
            opacity -= .1;
            setTimeout(() => { enactFade(elementRef); },100);
        }
        elementRef.style.opacity = opacity;
    }
}


/***************************************************
 * @dev Fade in a HTML element.
 * @param elementRef - a reference to the HTML element
 *      to which the fade is to be applied.
 */
function fadeInElement(elementRef) {
    let opacity = 0;
    enactFade(elementRef);
    function enactFade(elementRef) {
        if (opacity < 1) {
            opacity += .1;
            setTimeout(() => { enactFade(elementRef); },100);
        }
        elementRef.style.opacity = opacity;
    }
}


/***************************************************
 * @dev Send a message to other open tabs by making a change to localStorage.
 * @param message - the message you wish to send (String).
 */
function messageBroadcast(message) {
    localStorage.setItem('txPortalMessage',JSON.stringify(message));
    localStorage.removeItem('txPortalMessage'); // Remove it immediately so we can send another message if needed.
}


/***************************************************
 * @dev Receive and interpret a message from another open tab.
 *      (Given by the other tab making a change to localStorage.)
 * @param event - the event object fired from a change made to localStorage by any tab.
 *      to which the fade is to be applied.
 */
function messageReceive(event) {
    if (event.key == 'txPortalMessage') {
        var message = JSON.parse(event.newValue);
        if (message == 'ReloadTxPortal') {
            // Reload the current tab.
            window.location.reload(true);
        }
    }
}


/***************************************************
 * @dev A generic error handler to write error information
 *      to the console, and if requested, into a notification
 *      visible to the user.
 * @param err - the error object generated when the error was thrown.
 * @param description - a helpful description of the error (String).
 * @param displayNotice - whether to display a notification to the user (boolean).
 */
function genericErrHandler(err, description, displayNotice) {
    console.error(`Error ${description}: ${err.message}.\nCode: ${err.code}. Data: ${err.data}`);
    if (displayNotice) displayNotification(`Error ${description}: ${err.message}.\nCode: ${err.code}. Data: ${err.data}`, 10000);
}
