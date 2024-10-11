from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import JSONParser
from rest_framework import status
from .models import Interaction
from .serializers import InteractionSerializer
import logging
from django.shortcuts import render

logger = logging.getLogger(__name__)


@csrf_exempt
def interaction_list(request):
    interactions = Interaction.objects.all().order_by('-date')
    return render(request, 'interaction_list.html', {'interactions': interactions})

@method_decorator(csrf_exempt, name='dispatch')
class InteractionList(APIView):
    parser_classes = [JSONParser]

    def post(self, request, *args, **kwargs):
        logger.debug("POST method triggered.")  # 确认方法是否被调用

        try:
            logger.debug("Received request data: %s", request.data)

            if isinstance(request.data, list):
                errors = []
                for item in request.data:
                    serializer = InteractionSerializer(data=item)
                    if serializer.is_valid():
                        serializer.save()
                        logger.debug("Data successfully saved.")

                    else:
                        logger.error("Validation errors: %s", serializer.errors)

                        errors.append(serializer.errors)

                if errors:
                    logger.error("Validation errors: %s", errors)
                    return Response(errors, status=status.HTTP_400_BAD_REQUEST)

                return Response({"detail": "All interactions synced successfully!"}, status=status.HTTP_201_CREATED)
            else:
                logger.error("Invalid data format: Expected a list of interactions.")
                return Response({"error": "Invalid data format: Expected a list of interactions."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error("An error occurred: %s", str(e))
            return Response({"error": "Internal server error. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

