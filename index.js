const { Ed25519Keypair } = require('@onelabs/sui/keypairs/ed25519');
const { Transaction } = require('@onelabs/sui/transactions');
const { SuiClient } = require('@onelabs/sui/client');

/**
 * OneChain Gas Pool完整示例
 * 展示如何使用Gas Pool服务进行赞助交易
 */

class GasPoolDemo {
    constructor() {
        this.client = new SuiClient({ url: 'https://rpc-testnet.onelabs.cc:443' });
        this.gasPoolUrl = 'http://localhost:9527';
        this.authToken = 'your-secret-token';
        this.sponsorAddress = '0xaaaaa330ccb7c395bb6f6aae97fa437f15d80e3070709c16887527e353debc28';
    }

    async reserveGas(gasBudget = 50000000, durationSecs = 600) {
        console.log('预留Gas...');
        const response = await fetch(`${this.gasPoolUrl}/v1/reserve_gas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
            },
            body: JSON.stringify({
                sponsor_address: this.sponsorAddress,
                gas_budget: gasBudget,
                reserve_duration_secs: durationSecs
            })
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(`预留Gas失败: ${data.error}`);
        }

        console.log('Gas预留成功:');
        console.log(`   预留ID: ${data.result.reservation_id}`);
        console.log(`   Sponsor: ${data.result.sponsor_address}`);
        console.log(`   Gas币数量: ${data.result.gas_coins.length}`);
        
        return data.result;
    }

    async createTransaction(userKeypair, gasReservation) {
        console.log('创建交易...');
        
        const userAddress = userKeypair.getPublicKey().toSuiAddress();
        const txb = new Transaction();
        
        // 调用一个简单的只读函数作为示例
        txb.moveCall({
            target: '0x2::tx_context::epoch',
            arguments: []
        });
        
        // 设置交易参数
        txb.setSender(userAddress);
        txb.setGasBudget(50000000);
        
        // 设置 Gas 支付信息
        const gasObject = gasReservation.gas_coins[0];
        txb.setGasPayment([{
            objectId: gasObject.objectId,
            version: gasObject.version,
            digest: gasObject.digest
        }]);
        
        // 关键：设置Gas Owner为Sponsor地址
        txb.setGasOwner(gasReservation.sponsor_address);
        
        // 构建交易
        const txBytes = await txb.build({ 
            client: this.client,
            skipGasEstimation: true // 跳过Gas估算
        });
        
        console.log('交易创建成功:');
        console.log(`   交易字节大小: ${txBytes.length} bytes`);
        
        return txBytes;
    }

    async signTransaction(userKeypair, txBytes) {
        console.log('签名交易...');
        
        const signature = await userKeypair.signTransaction(txBytes);
        
        console.log('交易签名成功');
        
        return signature;
    }

    async executeTransaction(reservationId, txBytes, signature) {
        console.log('执行赞助交易...');
        
        const response = await fetch(`${this.gasPoolUrl}/v1/execute_tx`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
            },
            body: JSON.stringify({
                reservation_id: reservationId,
                tx_bytes: Buffer.from(txBytes).toString('base64'),
                user_sig: signature.signature // 只发送signature.signature字符串，而不是整个对象
            })
        });

        const result = await response.json();
        
        if (result.error) {
            throw new Error(`交易执行失败: ${result.error}`);
        }

        console.log('交易执行成功！');
        console.log(`   交易摘要: ${result.effects.transactionDigest}`);
        console.log(`   执行状态: ${result.effects.status.status}`);
        console.log(`   Gas 使用: ${result.effects.gasUsed.computationCost} MIST`);
        
        return result;
    }

    async runDemo() {
        try {
            console.log('OneChain Gas Pool 赞助交易示例\n');

            // 1. 生成用户密钥对
            const userKeypair = new Ed25519Keypair();
            const userAddress = userKeypair.getPublicKey().toSuiAddress();
            console.log('用户信息:');
            console.log(`   地址: ${userAddress}`);
            console.log(`   公钥: ${userKeypair.getPublicKey().toBase64()}\n`);

            // 2. 预留 Gas
            const gasReservation = await this.reserveGas();
            console.log();

            // 3. 创建交易
            const txBytes = await this.createTransaction(userKeypair, gasReservation);
            console.log();

            // 4. 签名交易
            const signature = await this.signTransaction(userKeypair, txBytes);
            console.log();

            // 5. 执行交易
            const result = await this.executeTransaction(
                gasReservation.reservation_id, 
                txBytes, 
                signature
            );
            console.log();

            console.log('示例完成！用户成功执行了一笔由Gas Pool赞助的交易。');
            
        } catch (error) {
            console.error('错误:', error.message);
            console.error('详细信息:', error);
        }
    }
}

// 运行示例
if (require.main === module) {
    const demo = new GasPoolDemo();
    demo.runDemo();
}

module.exports = GasPoolDemo;
