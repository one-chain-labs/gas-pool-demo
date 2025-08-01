# OneChain Gas Pool示例项目

本DEMO主要是演示前端如何集成OneChain Gas Pool服务进行赞助交易。

如何搭建OneChain Gas Pool服务，请参考《[OneChain Gas Pool部署指南：从零搭建赞助交易服务.md](./OneChain%20Gas%20Pool部署指南：从零搭建赞助交易服务.md)》一文。

## 🎯 什么是Gas Pool

Gas Pool是一个为OneChain提供交易Gas赞助服务的系统。用户创建交易后，由Gas Pool服务支付Gas费用，实现零Gas交易体验。

## 🔧 环境要求

- Node.js 18+
- 预先编译好的one-gas-station和tool

## 📦 快速开始

### 1. 安装依赖
```bash
yarn install
```

### 2. 启动 Gas Pool 服务

这里我将编译好的one-gas-station和tool命令放在了`gas-pool-server/`目录下，以便测试：

```bash
cd ./gas-pool-server
chmod +x ./one-gas-station ./tool
export GAS_STATION_AUTH="your-secret-token" && ./one-gas-station --config-path sample.yaml
```

### 3. 运行示例
```bash
yarn start
# 或
node index.js
```

### 4. 使用流程

1. **预留 Gas** - 向 Gas Pool 请求预留指定数量的 Gas
2. **创建交易** - 使用 Sui SDK 构建交易，设置正确的 Gas Owner
3. **签名交易** - 用户使用私钥签名交易
4. **执行交易** - 提交到 Gas Pool 完成赞助交易

## ✅ 成功示例

运行成功时，您将看到类似输出：

```
OneChain Gas Pool赞助交易示例

用户信息:
   地址: 0x11e90615e2e11772bf5ed8a873846fa82158e70762e842d025b621b36d945e21
   公钥: TvE2Hccwstc7VZDqIPobvaI/rmYVpHwHSp7RfejV7xQ=

预留Gas...
Gas预留成功:
   预留ID: 44
   Sponsor: 0xaaaaa330ccb7c395bb6f6aae97fa437f15d80e3070709c16887527e353debc28
   Gas币数量: 1

创建交易...
交易创建成功:
   交易字节大小: 211 bytes

签名交易...
交易签名成功

执行赞助交易...
交易执行成功！
   交易摘要: 3i2yRPWH3MCbSe7fXUtm3vhzkwkTzzyj81Y8fxEJfHnR
   执行状态: success
   Gas 使用: 1000000 MIST

示例完成！用户成功执行了一笔由Gas Pool赞助的交易。
```

## 📋 API 端点

- `POST /v1/reserve_gas` - 预留 Gas 币
- `POST /v1/execute_tx` - 执行赞助交易
- `GET /v1/support_address` - 查询支持地址·

##  相关链接

- [OneChain 官网](https://onelabs.cc)
- [OneChain Testnet RPC](https://rpc-testnet.onelabs.cc:443)


