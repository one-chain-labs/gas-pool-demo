# OneChain Gas Pool部署指南：从零搭建赞助交易服务

## 前言

如果你正在OneChain上开发DApp，并考虑在某些场景下为用户免除gas费，比如：
- 交易机器人自动跟单
- GameFi 中频繁的数据上报
- NFT 市场的批量操作……
那么你需要一个Gas Pool服务，本文正是为你而准备的。

OneChain Gas Pool正是为解决这一痛点而生的基础设施。它通过预先准备大量小额OCT资金池，让你可以为用户承担gas费用，将复杂的区块链交易成本完全隐藏在后台，用户只需专注于DApp本身的价值。
本文将带你在OneChain上从零开始搭建一套完整的Gas Pool服务，包括环境配置、服务部署、功能验证和DApp集成等全流程，让你的DApp真正做到对用户零门槛。

## 什么是Gas Pool

### 工作原理
Gas Pool本质上是一个自动化的资金管理系统，它代替用户执行交易，支付Gas并完成交易，用户是无感的。在OneChain Gas Pool方案中，它将大额OCT智能分割成众多小额gas coins，并通过Redis进行状态管理。
当DApp需要为用户支付gas费时，Gas Pool会临时分配合适的gas coins，交易完成后自动回收或更新状态。
这种设计的优势在于：
- **高并发支持**：多个gas coins可以同时被不同交易使用
- **智能管理**：系统自动处理资金分割和回收
- **灵活预留**：支持按需预留和超时释放机制

### 架构组成
一个完整的Gas Pool服务包含三个核心组件：
1. **Redis存储层**：负责存储所有gas coin对象信息和预留状态
2. **Gas Pool服务器**：提供JSON-RPC API接口，处理预留和执行请求
3. **签名模块**：支持内存签名或KMS Sidecar两种方式
> KMS Sidecar是一种云端密钥管理服务，私钥存储在云端的安全保险库中（比如 AWS KMS），需要签名时通过API请求云端帮你签名。

### 业务价值
传统区块链DApp的用户流程通常是：`获取代币 → 发起交易 → 支付gas → 使用DApp`。
有了Gas Pool，流程简化为：`连接钱包 → 直接使用`。这种改变对用户获取和留存具有显著价值。

## 环境准备

### 开发环境要求
在开始部署之前，确保你的环境满足以下要求：
- **操作系统**：macOS或Linux（我使用的是MacOS）
- **Rust 环境**：版本1.80或更高
- **Docker**：用于运行Redis服务
- **Git**：用于获取项目代码
- **Curl**：用于http请求

### OneChain网络配置
本文基于OneChain Testnet部署，相关端点信息：
```
Testnet RPC: https://rpc-testnet.onelabs.cc:443
Testnet Faucet: https://faucet-testnet.onelabs.cc
```

### 准备赞助地址
Gas Pool需要一个专用的OneChain地址作为资金池。这个地址后续只能用于Gas Pool服务，尽量不做他用，以便审计资金流水。
```bash
# 创建新地址
one client new-address ed25519

# 查看地址列表
one client addresses

# 切换到新地址
one client switch --address <your-address>

# 充值OCT：测试网通过水龙头获取测试OCT，主网则通过其他途径获取
one client faucet
```
创建地址后，记录好地址和对应的别名，后续配置会用得上。

## 服务部署

### 获取项目代码
首先，我们下载OneChain Gas Pool项目代码：
```bash
cd ~/workspace/rustproject

git clone https://github.com/one-chain-labs/gas-pool.git
cd gas-pool
```

### 编译项目
```bash
# 更新依赖
cargo update

# 编译项目
cargo build --release
```
编译完成后，在`target/release/`目录下会生成两个关键程序：
- `one-gas-station`：主服务程序
- `tool`：辅助工具集

### 部署Redis服务
由于Gas Pool依赖Redis来存储状态信息。这里我使用Docker来快速启动一个Redis实例：
```bash
docker run -d --name redis-server-01 \
  -p 6379:6379 \
  redis:7.2.4 \
  redis-server
```

验证Redis服务状态：
```bash
docker exec redis-server-01 redis-cli ping
# 应该返回: PONG
```

## 配置文件设置

### 生成配置模板
使用项目提供的工具生成基础配置：
```bash
./target/release/tool generate-sample-config --config-path sample.yaml
```

### 配置参数详解
根据你的环境调整`sample.yaml`配置文件：
```yaml
---
signer-config:
  local:
    keypair:                      # 私钥配置
      - "你的Base64编码KeyPair"    # 从keystore获取
rpc-host-ip: 0.0.0.0
rpc-port: 9527                    # RPC服务端口
metrics-port: 9184                # 监控指标端口
gas-pool-config:
  redis:
    redis_url: "redis://127.0.0.1:6379"             # Redis连接URL
fullnode-url: "https://rpc-testnet.onelabs.cc:443"  # OneChain节点
coin-init-config:
  target-init-balance: 100000000    # 每个gas coin目标余额(MIST) 
  refresh-interval-sec: 3600        # 资金检查间隔(秒)
daily-gas-usage-cap: 1500000000000  # 每日使用上限
```

### 获取私钥配置
从OneChain客户端导出私钥用于配置：
```bash
# 导出指定地址的私钥
one keytool export --key-identity <your-address>

# 或直接查看keystore文件
cat ~/.one/one_config/one.keystore
```
**重要提醒**：
- `keypair`配置必须使用数组格式
- `target-init-balance`单位为 MIST（1 OCT = 10^9 MIST），建议将单个gas coin设置为0.1 OCT（100,000,000 MIST）

## 服务启动与验证

### 设置认证令牌
Gas Pool使用环境变量进行API认证：
```bash
export GAS_STATION_AUTH="your-secret-token"
```
这个令牌可以是任意字符串，用于保护API访问安全。

### 启动服务
完成配置后，我们执行以下命令启动Gas Pool服务：
```bash
./target/release/one-gas-station --config-path sample.yaml
```
服务启动成功后，你会看到类似的日志输出：
```bash
INFO one_gas_station::command: Metrics server started at 0.0.0.0:9184
INFO one_gas_station::command: Sponsor addresses: [0xaaaaa330ccb7c395bb6f6aae97fa437f15d80e3070709c16887527e353debc28]
INFO one_gas_station::storage::redis: Number of available gas coins in the pool: 123, total balance: 13555310120
INFO one_gas_station::rpc::server: listening on 0.0.0.0:9527
```
从以上日志我们可以得知：
- 监控服务已在端口`9184`启动
- 识别到赞助地址和可用资金
- Gas pool已初始化完成
- RPC服务正在端口`9527`监听

服务启动成功后，我们来验证一下核心功能是否正常工作。

### 功能验证

#### 健康检查
```bash
curl -X GET http://localhost:9527/
# 正常响应: OK
```

```bash
curl -X GET http://localhost:9527/version
# 正常响应: 0.4.0-bf5b05c8da9e-dirty
```

```bash
curl -X GET http://localhost:9527/v1/support_address \
  -H "Authorization: Bearer your-secret-token"

# 正常响应: {"sponsor_addresses":["0xaaaaa330ccb7c395bb6f6aae97fa437f15d80e3070709c16887527e353debc28"],"error":null}
```

#### Gas预留功能测试
```bash
curl -X POST http://localhost:9527/v1/reserve_gas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{
    "sponsor_address": "0xaaaaa330ccb7c395bb6f6aae97fa437f15d80e3070709c16887527e353debc28",
    "gas_budget": 50000000,
    "reserve_duration_secs": 600
  }'
```
成功的响应应该包含预留ID和对应的gas coins信息，如下：
```json
{
  "result": {
    "sponsor_address": "0xaaaaa330ccb7c395bb6f6aae97fa437f15d80e3070709c16887527e353debc28",
    "reservation_id": 1,
    "gas_coins": [{
      "objectId": "0x6b0e765bbbc3dfed11e659eef764eada0ab045e615eb0a0418f297db4a9293bb",
      "version": 12,
      "digest": "5hgpLtLq13EQDhF7TURFsHnAeTmPbqYB7rTHCiPV1Y6z"
    }]
  },
  "error": null
}
```

## DApp集成指南

### 赞助交易流程
一个典型的赞助交易流程包含以下步骤：
1. **交易构建**：DApp后端构建不包含gas信息的交易
2. **Gas预留**：向Gas Pool请求预留适量的gas coins
3. **交易完善**：将预留的gas coins添加到交易中
4. **用户签名**：用户对完整交易进行签名确认
5. **交易执行**：通过Gas Pool提交并执行已签名的交易
6. **状态更新**：系统自动处理gas coins的状态变更

### Node.js集成示例

以下是Gas Pool集成的主要代码：

```javascript
const { Ed25519Keypair } = require('@onelabs/sui/keypairs/ed25519');
const { Transaction } = require('@onelabs/sui/transactions');
const { SuiClient } = require('@onelabs/sui/client');

class GasPoolDemo {
    constructor() {
        this.client = new SuiClient({ url: 'https://rpc-testnet.onelabs.cc:443' });
        this.gasPoolUrl = 'http://localhost:9527';
        this.authToken = 'your-secret-token';
        this.sponsorAddress = '0xaaaaa330ccb7c395bb6f6aae97fa437f15d80e3070709c16887527e353debc28';
    }

    // 1. 预留 Gas
    async reserveGas(gasBudget = 50000000, durationSecs = 600) {
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
        return data.result;
    }

    // 2. 创建交易
    async createTransaction(userKeypair, gasReservation) {
        const txb = new Transaction();
        txb.moveCall({ target: '0x2::tx_context::epoch', arguments: [] });
        txb.setSender(userKeypair.getPublicKey().toSuiAddress());
        txb.setGasBudget(50000000);
        
        // 关键：设置预留的 Gas 和 Owner
        const gasObject = gasReservation.gas_coins[0];
        txb.setGasPayment([{
            objectId: gasObject.objectId,
            version: gasObject.version,
            digest: gasObject.digest
        }]);
        txb.setGasOwner(gasReservation.sponsor_address);
        
        return await txb.build({ client: this.client, skipGasEstimation: true });
    }

    // 3. 执行交易
    async executeTransaction(reservationId, txBytes, signature) {
        const response = await fetch(`${this.gasPoolUrl}/v1/execute_tx`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
            },
            body: JSON.stringify({
                reservation_id: reservationId,
                tx_bytes: Buffer.from(txBytes).toString('base64'),
                user_sig: signature.signature
            })
        });
        return await response.json();
    }
}
```

**关键要点**：
- 使用 `@onelabs/sui` SDK 构建交易
- 通过 `setGasOwner()` 设置sponsor地址
- 预留Gas → 构建交易 → 用户签名 → 执行交易

**依赖安装**：
```bash
yarn add @onelabs/sui
```

**完整示例项目**：
上述代码的完整可运行版本可以在以下仓库中找到：
https://github.com/simon-onelabs/gas-pool-demo

该项目包含：
- 完整的 Gas Pool 集成示例
- 预编译的 Gas Pool 服务
- 详细的使用说明
- 一键运行脚本

### 最佳实践建议
在集成Gas Pool到生产环境时，建议遵循以下最佳实践：
**预留时间设置**：为用户签名留出充足时间，建议至少5分钟
**错误处理**：实现完善的错误处理和重试机制
**监控告警**：监控gas coins余额，及时补充资金
**安全考虑**：定期轮换API认证令牌，限制访问来源

## 运维监控

### 监控指标
Gas Pool在端口`9184`提供Prometheus格式的监控指标：
```bash
curl http://localhost:9184/metrics
```
关键指标包括：
- 可用gas coins数量
- 总余额状态
- 预留使用情况
- API 调用统计
- 错误率分析

### 日常维护
**资金管理**：
- 监控资金池余额，设置告警阈值
- 及时向赞助地址充值，系统会自动检测并分割新资金
- 根据业务增长调整 `daily-gas-usage-cap`

**性能优化**：
- 根据并发需求调整 `target-init-balance`
- 优化 `refresh-interval-sec` 设置，平衡检测频率和性能
- 在高负载情况下考虑部署多实例

**安全维护**：
- 定期轮换API认证令牌
- 监控异常gas消耗模式
- 实施适当的访问控制和限流策略

## 总结

现在，你已经拥有了一套完整的Gas Pool服务，可以开始为用户提供真正无缝的交易体验了。
无论你的应用场景是自动化交易、游戏数据上报，还是NFT批量操作，用户都能专注于核心功能，而不再被gas费问题困扰。这种体验上的提升，往往能为你的项目带来意想不到的用户增长。
上线前记得做好充分测试和监控准备。如果你在部署过程中遇到问题，欢迎一起学习交流：technology@onelabs.cc。
祝你的DApp用户体验更上一层楼！