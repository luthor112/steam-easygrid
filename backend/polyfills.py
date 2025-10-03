import json
import urllib.error
import urllib.request

class response_wrapper:
    def __init__(self, wrapped_req, stream_mode):
        self.stream_mode = stream_mode

        try:
            wrapped_resp = urllib.request.urlopen(wrapped_req)
            
            self.status_code = wrapped_resp.status
            self.url = wrapped_resp.url

            if self.stream_mode:
                self.raw = wrapped_resp
            else:
                self.resp_data = wrapped_resp.read()
        except urllib.error.HTTPError as err:
            self.status_code = err.code
            self.url = err.url
            self.raw = None
            self.resp_data = ""

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
        return response_wrapper(req, stream)
