# 托福考位自动查询

指定时间和地点，不停查询是否有剩余的考位，给手机发送通知。

## How-to

设置以下环境变量：

- `CAPTCHA_APIKEY`: http://2captcha.com/ 的API KEY，用来解验证码。需要充点钱。
- `PUSHOVER_USER`: Pushover的user key，用来发送通知
- `PUSHOVER_TOKEN`: Pushover的token，用来发送通知
- `TOEFL_USER`: 托福的用户名，像是"6411111"
- `TOEFL_PASSWD`: 托福密码

然后跑起来

- `npm i`
- `node index.js`


随便撸的代码，不再维护了（毕竟就这一次……


## Notes

- 托福网站的js做了一些加密，直接搞API不太现实，还是headless chrome吧
- 托福网站会做headless chrome的检测，见代码66行
