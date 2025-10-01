import json
import urllib.request

class response_wrapper:
    def __init__(self, wrapped_resp, stream_mode):
        self.stream_mode = stream_mode
        self.status_code = wrapped_resp.status
        self.url = wrapped_resp.url

        if self.stream_mode:
            self.raw = wrapped_resp
        else:
            self.resp_data = wrapped_resp.read()

    def __enter__(self):
        return self

    def __exit__(self, exception_type, exception_value, exception_traceback):
        if self.stream_mode:
            self.raw.close()

    def json(self):
        if self.stream_mode:
            return json.load(self.raw)
        else:
            return json.loads(self.resp_data)

class requests:
    @staticmethod
    def get(url, headers={}, stream=False):
        req = urllib.request.Request(url, headers=headers, method="GET")
        resp = urllib.request.urlopen(req)
        return response_wrapper(resp, stream)
