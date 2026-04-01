import axios, { AxiosInstance } from 'axios';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

export class FeishuClient {
  private http: AxiosInstance;
  private appId: string;
  private appSecret: string;
  private tenantAccessToken: string = '';
  private tokenExpireTime: number = 0;

  constructor(config: FeishuConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.http = axios.create({
      baseURL: 'https://open.feishu.cn/open-apis',
      timeout: 30000,
    });
  }

  private async getTenantAccessToken(): Promise<string> {
    if (this.tenantAccessToken && Date.now() < this.tokenExpireTime) {
      return this.tenantAccessToken;
    }

    try {
      const response = await this.http.post('/auth/v3/tenant_access_token/internal', {
        app_id: this.appId,
        app_secret: this.appSecret,
      });

      if (response.data.code === 0) {
        this.tenantAccessToken = response.data.tenant_access_token;
        this.tokenExpireTime = Date.now() + (response.data.expire - 60) * 1000;
        return this.tenantAccessToken;
      } else {
        throw new Error(`获取 tenant_access_token 失败: ${response.data.msg}`);
      }
    } catch (error: any) {
      throw new Error(`获取 tenant_access_token 异常: ${error.message}`);
    }
  }

  private async request(method: string, path: string, data?: any, retryCount = 0): Promise<any> {
    const maxRetries = 3;

    try {
      const token = await this.getTenantAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const response = await this.http.request({
        method,
        url: path,
        data,
        headers,
      });

      if (response.data.code !== 0) {
        if (response.data.code === 99991663 && retryCount < maxRetries) {
          this.tenantAccessToken = '';
          return this.request(method, path, data, retryCount + 1);
        }
        throw new Error(`API 错误: ${response.data.msg}`);
      }

      return response.data.data;
    } catch (error: any) {
      if (retryCount < maxRetries && this.isRetryableError(error)) {
        await this.delay(1000 * (retryCount + 1));
        return this.request(method, path, data, retryCount + 1);
      }
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    if (error.response) {
      const status = error.response.status;
      return status === 429 || status === 503 || status === 504;
    }
    return true;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async sendUserMessage(openId: string, content: string): Promise<void> {
    await this.request('POST', '/im/v1/messages?receive_id_type=open_id', {
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text: content }),
    });
  }

  async sendGroupMessage(chatId: string, content: string): Promise<void> {
    await this.request('POST', '/im/v1/messages?receive_id_type=chat_id', {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: content }),
    });
  }

  async sendGroupMessageWithAt(chatId: string, content: string, openIds: string[]): Promise<void> {
    const atSegments = openIds.map((openId) => ({
      type: 'at',
      open_id: openId,
    }));

    const textSegments = content.split(/@[\u4e00-\u9fa5a-zA-Z0-9]+/).filter(Boolean);

    const segments: any[] = [];
    for (let i = 0; i < textSegments.length; i++) {
      if (textSegments[i]) {
        segments.push({ type: 'text', text: { text: textSegments[i] } });
      }
      if (i < atSegments.length) {
        segments.push(atSegments[i]);
      }
    }

    if (segments.length === 0) {
      segments.push({ type: 'text', text: { text: content } });
    }

    await this.request('POST', '/im/v1/messages?receive_id_type=chat_id', {
      receive_id: chatId,
      msg_type: 'post',
      content: JSON.stringify({
        zh_cn: {
          title: '',
          content: [segments],
        },
      }),
    });
  }
}
