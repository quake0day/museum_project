import base64
import uuid
from django.core.files.base import ContentFile
from rest_framework import serializers
from .models import Interaction

class Base64ImageField(serializers.ImageField):
    """
    A Django REST framework field for handling image uploads through raw base64 encoded data.
    """

    def to_internal_value(self, data):
        # 检查数据是否是 base64 编码格式
        if isinstance(data, str) and data.startswith('data:image'):
            # 分离文件类型和数据部分
            format, imgstr = data.split(';base64,') 
            ext = format.split('/')[-1]  # 提取文件扩展名

            # 解码 base64 数据并转换为 Django 文件对象
            data = ContentFile(base64.b64decode(imgstr), name=f'{uuid.uuid4()}.{ext}')

        return super().to_internal_value(data)

class InteractionSerializer(serializers.ModelSerializer):
    image = Base64ImageField()  # 使用自定义的 Base64ImageField 来处理 base64 编码的图像数据

    class Meta:
        model = Interaction
        fields = ['id', 'response', 'date', 'image']

